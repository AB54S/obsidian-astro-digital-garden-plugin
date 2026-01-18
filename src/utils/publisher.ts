import * as fs from "fs"; // eslint-disable-line
import { App, Notice, TFile } from "obsidian";
import * as path from "path"; // eslint-disable-line
import { DigitalGardenSettings } from "../settings";
import { AssetReference, computeSlug, processMarkdownAssets } from "./asset-processor";
import { GitHubClient, UploadResult } from "./github-client";
import { SyncManifestManager } from "./sync-manifest";
import { createEmptySummary, ProgressReporter, PublishSummary } from "./progress-reporter";
import { FrontmatterValidator } from "./validator";

/**
 * Result of publishing a single file
 */
export interface PublishResult {
	success: boolean;
	slug: string;
	markdownUploaded: boolean;
	assetsUploaded: number;
	assetsSkipped: number;
	warnings: string[];
	error?: string;
}

/**
 * Publisher class handles publishing markdown files and their assets
 * to both local filesystem and GitHub.
 */
export class Publisher {
	app: App;
	settings: DigitalGardenSettings;
	private githubClient: GitHubClient | null = null;

	constructor(app: App, settings: DigitalGardenSettings) {
		this.app = app;
		this.settings = settings;
	}

	/**
	 * Update settings reference (called when settings change)
	 */
	updateSettings(settings: DigitalGardenSettings): void {
		this.settings = settings;
		this.githubClient = null; // Reset client so it picks up new settings
	}

	/**
	 * Get or create the GitHub client
	 */
	private getGitHubClient(): GitHubClient | null {
		if (!this.settings.githubOwner || !this.settings.githubRepo || !this.settings.githubToken) {
			return null;
		}

		if (!this.githubClient) {
			this.githubClient = new GitHubClient({
				owner: this.settings.githubOwner,
				repo: this.settings.githubRepo,
				branch: this.settings.githubBranch || "main",
				token: this.settings.githubToken,
			});
		}

		return this.githubClient;
	}

	/**
	 * Publish a single file to all configured destinations
	 */
	async publish(file: TFile): Promise<boolean> {
		let success = true;

		if (this.settings.localOutputPath) {
			const localSuccess = await this.publishToLocal(file);
			if (!localSuccess) success = false;
		}

		const client = this.getGitHubClient();
		if (client) {
			const result = await this.publishToGitHub(file, client);
			if (!result.success) success = false;
		}

		return success;
	}

	/**
	 * Publish all eligible files with progress reporting and sync
	 */
	async publishAll(
		files: TFile[],
		reporter: ProgressReporter
	): Promise<PublishSummary> {
		const summary = createEmptySummary();
		const client = this.getGitHubClient();

		// Set up sync manifest if enabled
		let syncManager: SyncManifestManager | null = null;
		if (client && this.settings.enableSync) {
			syncManager = new SyncManifestManager(client, this.settings.contentDirectory);
			await syncManager.loadManifest();
		}

		// Filter to eligible files
		const eligibleFiles: TFile[] = [];
		for (const file of files) {
			const metadata = this.app.metadataCache.getFileCache(file);
			const validation = FrontmatterValidator.validate(file, metadata);

			if (validation.ignore) {
				summary.postsSkipped++;
				continue;
			}

			if (!validation.isValid) {
				summary.postsInvalid++;
				for (const error of validation.errors) {
					summary.warnings.push(`${file.name}: ${error}`);
				}
				continue;
			}

			eligibleFiles.push(file);
		}

		reporter.start(eligibleFiles.length, `Publishing ${eligibleFiles.length} posts...`);

		// Publish each eligible file
		for (const file of eligibleFiles) {
			const slug = computeSlug(file);
			reporter.status(`Publishing: ${file.basename}`);

			try {
				// Local publishing
				if (this.settings.localOutputPath) {
					const localSuccess = await this.publishToLocal(file);
					if (!localSuccess) {
						summary.errors.push(`Local publish failed: ${file.name}`);
					}
				}

				// GitHub publishing
				if (client) {
					const result = await this.publishToGitHub(file, client);

					if (result.success) {
						summary.postsPublished++;
						summary.assetsUploaded += result.assetsUploaded;
						summary.assetsSkipped += result.assetsSkipped;

						// Register with sync manifest
						if (syncManager) {
							const targetDir = `${this.settings.contentDirectory}/${slug}`;
							syncManager.registerPublishedPost(
								slug,
								file.path,
								`${targetDir}/index.md`,
								result.warnings.filter(w => w.startsWith("Asset:")),
								slug // Using slug as simple content identifier
							);
						}
					} else {
						summary.errors.push(`GitHub publish failed: ${file.name} - ${result.error ?? "Unknown error"}`);
					}

					// Add warnings
					for (const warning of result.warnings) {
						summary.warnings.push(`${file.name}: ${warning}`);
					}
				} else if (!this.settings.localOutputPath) {
					// No publishing targets configured
					summary.warnings.push(`${file.name}: No publish destination configured`);
				} else {
					// Local only, still count as published
					summary.postsPublished++;
				}
			} catch (e) {
				const error = e as Error;
				summary.errors.push(`${file.name}: ${error.message}`);
			}

			reporter.increment();
		}

		// Handle sync deletions
		if (syncManager && this.settings.enableSync) {
			try {
				reporter.status("Checking for stale content...");
				const operations = syncManager.computeDeleteOperations();

				if (operations.pathsToDelete.length > 0) {
					reporter.status(`Deleting ${operations.pathsToDelete.length} stale files...`);
					summary.filesDeleted = await syncManager.executeDeletes(operations);
				}

				// Save updated manifest
				await syncManager.saveManifest();
			} catch (e) {
				const error = e as Error;
				summary.warnings.push(`Sync error: ${error.message}`);
			}
		}

		reporter.complete(summary);
		return summary;
	}

	/**
	 * Publish a file to the local filesystem
	 */
	async publishToLocal(file: TFile): Promise<boolean> {
		try {
			const content = await this.app.vault.read(file);
			const destinationPath = this.settings.localOutputPath;

			if (!destinationPath) {
				return false;
			}

			// Check if fs is available (desktop only)
			if (typeof fs.existsSync !== "function") {
				return true; // Skip silently on mobile
			}

			if (!fs.existsSync(destinationPath)) {
				new Notice(`Destination folder does not exist: ${destinationPath}`);
				return false;
			}

			const slug = computeSlug(file);
			const postFolder = path.join(destinationPath, slug);

			if (!fs.existsSync(postFolder)) {
				fs.mkdirSync(postFolder, { recursive: true });
			}

			// Process assets and rewrite links
			const processed = processMarkdownAssets(this.app, file, content, slug);

			// Copy assets locally
			for (const asset of processed.assets) {
				await this.copyAssetLocally(asset, postFolder);
			}

			// Transform frontmatter and write markdown
			let processedContent = processed.rewrittenMarkdown;
			processedContent = this.transformFrontmatter(processedContent);

			const targetFile = path.join(postFolder, "index.md");
			fs.writeFileSync(targetFile, processedContent);

			return true;
		} catch (e) {
			console.error("Failed to publish file locally", e);
			new Notice(`Failed to publish file locally: ${(e as Error).message}`);
			return false;
		}
	}

	/**
	 * Copy an asset to a local folder
	 */
	private async copyAssetLocally(asset: AssetReference, destinationFolder: string): Promise<void> {
		const content = await this.app.vault.readBinary(asset.vaultFile);
		const targetPath = path.join(destinationFolder, asset.targetFilename);
		// eslint-disable-next-line no-undef
		fs.writeFileSync(targetPath, Buffer.from(content));
	}

	/**
	 * Publish a file to GitHub with all its assets
	 */
	async publishToGitHub(file: TFile, client: GitHubClient): Promise<PublishResult> {
		const slug = computeSlug(file);
		const targetDir = `${this.settings.contentDirectory}/${slug}`;
		const warnings: string[] = [];

		let assetsUploaded = 0;
		let assetsSkipped = 0;

		try {
			const content = await this.app.vault.read(file);

			// 1. Process assets and rewrite links
			const processed = processMarkdownAssets(this.app, file, content, targetDir);
			warnings.push(...processed.warnings);

			// 2. Upload assets first (so links resolve)
			const assetPaths: string[] = [];
			for (const asset of processed.assets) {
				try {
					const result = await this.uploadAssetToGitHub(asset, client);
					assetPaths.push(asset.targetPath);

					if (result.uploaded) {
						assetsUploaded++;
					} else {
						assetsSkipped++;
					}
				} catch (e) {
					const error = e as Error;
					warnings.push(`Asset upload failed (${asset.targetFilename}): ${error.message}`);
				}
			}

			// 3. Transform and upload markdown
			let finalMarkdown = processed.rewrittenMarkdown;
			finalMarkdown = this.transformFrontmatter(finalMarkdown);

			const mdResult = await client.createOrUpdateFile(
				`${targetDir}/index.md`,
				finalMarkdown,
				`Publish: ${file.basename}`
			);

			return {
				success: true,
				slug,
				markdownUploaded: mdResult.uploaded,
				assetsUploaded,
				assetsSkipped,
				warnings,
			};
		} catch (e) {
			const error = e as Error;
			return {
				success: false,
				slug,
				markdownUploaded: false,
				assetsUploaded,
				assetsSkipped,
				warnings,
				error: error.message,
			};
		}
	}

	/**
	 * Upload a single asset to GitHub
	 */
	private async uploadAssetToGitHub(
		asset: AssetReference,
		client: GitHubClient
	): Promise<UploadResult> {
		const content = await this.app.vault.readBinary(asset.vaultFile);
		return client.createOrUpdateFile(
			asset.targetPath,
			content,
			`Add asset: ${asset.targetFilename}`
		);
	}

	/**
	 * Transform frontmatter for Astro compatibility.
	 * Removes the 'publish: true' line to avoid Astro schema errors.
	 */
	private transformFrontmatter(content: string): string {
		// Remove 'publish: true' or 'publish: false' lines
		return content.replace(/^publish:\s*(true|false)\s*$/m, "");
	}
}
