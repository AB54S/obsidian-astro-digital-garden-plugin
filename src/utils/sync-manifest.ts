import { GitHubClient } from "./github-client";

/**
 * Represents a published post in the manifest
 */
export interface ManifestPost {
	/** Original vault path of the source file */
	vaultPath: string;
	/** Path in the repo (e.g., "src/content/posts/my-post/index.md") */
	repoPath: string;
	/** Asset paths in the repo */
	assets: string[];
	/** Content SHA for quick comparison */
	contentSha: string;
}

/**
 * The publish manifest structure stored in the repository.
 * Tracks all published content to enable safe deletion of stale files.
 */
export interface PublishManifest {
	/** Manifest version for future compatibility */
	version: 1;
	/** ISO timestamp of last publish */
	lastPublish: string;
	/** Map of slug to post metadata */
	posts: Record<string, ManifestPost>;
}

/**
 * Path where the manifest is stored in the repository
 */
const MANIFEST_PATH = ".vault-publish/manifest.json";

/**
 * Create an empty manifest
 */
export function createEmptyManifest(): PublishManifest {
	return {
		version: 1,
		lastPublish: new Date().toISOString(),
		posts: {},
	};
}

/**
 * Result of computing sync operations
 */
export interface SyncOperations {
	/** Paths to delete from the repo */
	pathsToDelete: Array<{ path: string; sha: string }>;
	/** Slugs that were removed */
	removedSlugs: string[];
}

/**
 * Manages the publish manifest for tracking and syncing published content.
 */
export class SyncManifestManager {
	private client: GitHubClient;
	private contentDirectory: string;
	private currentManifest: PublishManifest | null = null;
	private newManifest: PublishManifest;

	constructor(client: GitHubClient, contentDirectory: string) {
		this.client = client;
		this.contentDirectory = contentDirectory;
		this.newManifest = createEmptyManifest();
	}

	/**
	 * Load the existing manifest from the repository.
	 * Returns an empty manifest if none exists.
	 */
	async loadManifest(): Promise<PublishManifest> {
		try {
			const content = await this.client.getFileContent(MANIFEST_PATH);
			if (content) {
				const parsed = JSON.parse(content) as PublishManifest;
				// Validate version
				if (parsed.version === 1 && typeof parsed.posts === "object") {
					this.currentManifest = parsed;
					return parsed;
				}
			}
		} catch (e) {
			console.warn("Could not load publish manifest, starting fresh:", e);
		}

		this.currentManifest = createEmptyManifest();
		return this.currentManifest;
	}

	/**
	 * Get the current manifest (must call loadManifest first)
	 */
	getCurrentManifest(): PublishManifest | null {
		return this.currentManifest;
	}

	/**
	 * Register a published post in the new manifest.
	 * Call this after successfully publishing each post.
	 */
	registerPublishedPost(
		slug: string,
		vaultPath: string,
		repoPath: string,
		assets: string[],
		contentSha: string
	): void {
		this.newManifest.posts[slug] = {
			vaultPath,
			repoPath,
			assets,
			contentSha,
		};
	}

	/**
	 * Compute which files need to be deleted based on manifest comparison.
	 * Only returns paths within the configured content directory for safety.
	 */
	computeDeleteOperations(): SyncOperations {
		const pathsToDelete: Array<{ path: string; sha: string }> = [];
		const removedSlugs: string[] = [];

		if (!this.currentManifest) {
			return { pathsToDelete, removedSlugs };
		}

		// Find slugs that were in old manifest but not in new
		for (const [slug, oldPost] of Object.entries(this.currentManifest.posts)) {
			if (!(slug in this.newManifest.posts)) {
				removedSlugs.push(slug);

				// Safety check: only delete files within content directory
				if (oldPost.repoPath.startsWith(this.contentDirectory)) {
					// We need to fetch the SHA for each file before deleting
					// Store the path for now, SHA will be fetched during deletion
					pathsToDelete.push({ path: oldPost.repoPath, sha: "" });
				}

				// Also mark assets for deletion
				for (const assetPath of oldPost.assets) {
					if (assetPath.startsWith(this.contentDirectory)) {
						pathsToDelete.push({ path: assetPath, sha: "" });
					}
				}
			}
		}

		return { pathsToDelete, removedSlugs };
	}

	/**
	 * Execute delete operations for stale files.
	 * Returns the count of successfully deleted files.
	 */
	async executeDeletes(operations: SyncOperations): Promise<number> {
		let deletedCount = 0;

		for (const item of operations.pathsToDelete) {
			try {
				// Fetch current SHA before deletion
				const sha = await this.client.getFileSha(item.path);
				if (sha) {
					await this.client.deleteFile(
						item.path,
						sha,
						`Remove stale file: ${item.path}`
					);
				deletedCount++;
				console.debug(`Deleted stale file: ${item.path}`);
				}
			} catch (e) {
				console.warn(`Failed to delete stale file ${item.path}:`, e);
				// Continue with other deletions even if one fails
			}
		}

		return deletedCount;
	}

	/**
	 * Save the new manifest to the repository.
	 * Call this after all posts have been published.
	 */
	async saveManifest(): Promise<void> {
		this.newManifest.lastPublish = new Date().toISOString();
		const content = JSON.stringify(this.newManifest, null, 2);

		await this.client.createOrUpdateFile(
			MANIFEST_PATH,
			content,
			"Update publish manifest"
		);
	}

	/**
	 * Get the new manifest being built
	 */
	getNewManifest(): PublishManifest {
		return this.newManifest;
	}

	/**
	 * Reset the new manifest for a fresh publish run
	 */
	resetNewManifest(): void {
		this.newManifest = createEmptyManifest();
	}

	/**
	 * Check if a post's content has changed since last publish.
	 * Returns true if the post should be re-published.
	 */
	hasPostChanged(slug: string, newContentSha: string): boolean {
		if (!this.currentManifest) {
			return true;
		}

		const existingPost = this.currentManifest.posts[slug];
		if (!existingPost) {
			return true;
		}

		return existingPost.contentSha !== newContentSha;
	}
}

