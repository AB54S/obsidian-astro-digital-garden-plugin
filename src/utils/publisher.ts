import * as fs from "fs"; // eslint-disable-line
import { App, Notice, TFile, arrayBufferToBase64, requestUrl } from "obsidian";
import * as path from "path"; // eslint-disable-line
import { DigitalGardenSettings } from "../settings";

interface GitHubPayload {
	message: string;
	content: string;
	branch: string;
	sha?: string;
}

export class Publisher {
	app: App;
	settings: DigitalGardenSettings;

	constructor(app: App, settings: DigitalGardenSettings) {
		this.app = app;
		this.settings = settings;
	}

	async publish(file: TFile): Promise<boolean> {
		let success = true;

		if (this.settings.localOutputPath) {
			const localSuccess = await this.publishToLocal(file);
			if (!localSuccess) success = false;
		}

		if (this.settings.githubRepo && this.settings.githubOwner && this.settings.githubToken) {
			const ghSuccess = await this.publishToGitHub(file);
			if (!ghSuccess) success = false;
		}

		return success;
	}

	async publishToLocal(file: TFile): Promise<boolean> {
		try {
			const content = await this.app.vault.read(file);
			const destinationPath = this.settings.localOutputPath;

			if (!destinationPath) {
				return false;
			}

			if (typeof fs.existsSync !== 'function') {
				return true;
			}

			if (!fs.existsSync(destinationPath)) {
				new Notice(`Destination folder does not exist: ${destinationPath}`);
				return false;
			}

			// Determine slug: if file is 'index.md' inside a folder, use parent folder name
			let slug = file.basename;
			if (slug.toLowerCase() === 'index' && file.parent) {
				slug = file.parent.name;
			}

			const postFolder = path.join(destinationPath, slug);

			if (!fs.existsSync(postFolder)) {
				fs.mkdirSync(postFolder, { recursive: true });
			}

			// Process assets (images) and update content
			let processedContent = await this.processAssetsAndCopy(file, content, postFolder);
			
			// Transform Frontmatter for Astro Compliance
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

	private transformFrontmatter(content: string): string {
		// remove 'publish: true' line to avoid schema errors if strict
		return content.replace(/^publish:\s*true\s*$/m, '');
	}

	private async processAssetsAndCopy(sourceFile: TFile, content: string, destinationFolder: string): Promise<string> {
		let newContent = content;
		const wikilinkRegex = /!\[\[(.*?)(?:\|.*?)?\]\]/g;
		const mdLinkRegex = /!\[(.*?)\]\((.*?)\)/g;

		// 1. Handle Wikilinks: ![[image.png]]
		let match;
		while ((match = wikilinkRegex.exec(content)) !== null) {
			const fullMatch = match[0];
			const linkText = match[1];
			
			if (linkText) {
				const linkedFile = this.app.metadataCache.getFirstLinkpathDest(linkText, sourceFile.path);
				if (linkedFile instanceof TFile && this.isImage(linkedFile)) {
					const sanitizedName = this.sanitizeFilename(linkedFile.name);
					await this.copyAsset(linkedFile, destinationFolder, sanitizedName);
					
					// Replace with standard markdown link with sanitized filename
					const replacement = `![${linkedFile.basename}](${sanitizedName})`;
					newContent = newContent.replace(fullMatch, replacement);
				}
			}
		}

		// 2. Handle Markdown links: ![alt](path/to/image.png)
		while ((match = mdLinkRegex.exec(content)) !== null) {
			const fullMatch = match[0];
			const altText = match[1];
			const linkPath = match[2];

			// Skip external links
			if (linkPath && !linkPath.startsWith("http")) {
				let linkedFile = this.app.metadataCache.getFirstLinkpathDest(decodeURI(linkPath), sourceFile.path);
				
				// Fallback: Try finding by name if path lookup fails (handles cases where path is just filename but not resolved correctly)
				if (!linkedFile) {
					const nameOnly = path.basename(decodeURI(linkPath));
					const files = this.app.vault.getFiles();
					linkedFile = files.find(f => f.name === nameOnly) || null;
				}

				if (linkedFile instanceof TFile && this.isImage(linkedFile)) {
					const sanitizedName = this.sanitizeFilename(linkedFile.name);
					await this.copyAsset(linkedFile, destinationFolder, sanitizedName);
					
					// Use sanitized name in link. NO encoding needed if sanitized name is safe (alphanumeric+dashes)
					const replacement = `![${altText}](${sanitizedName})`;
					newContent = newContent.replace(fullMatch, replacement);
				} else {
					console.warn(`Could not find image file for link: ${linkPath}`);
				}
			}
		}

		return newContent;
	}

	private isImage(file: TFile): boolean {
		const extensions = ["png", "jpg", "jpeg", "gif", "svg", "webp"];
		return extensions.includes(file.extension.toLowerCase());
	}

	private sanitizeFilename(filename: string): string {
		// Replace spaces and special chars with hyphens, keep extension
		return filename.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9._-]/g, '');
	}

	private async copyAsset(file: TFile, destinationFolder: string, targetFilename: string) {
		const content = await this.app.vault.readBinary(file);
		const targetPath = path.join(destinationFolder, targetFilename);
		// eslint-disable-next-line no-undef
		fs.writeFileSync(targetPath, Buffer.from(content));

	}

	async publishToGitHub(file: TFile): Promise<boolean> {
		try {
			const content = await this.app.vault.readBinary(file);
			// TODO: Transform frontmatter for GitHub too? 
			// For now, raw binary copy implies we send EXACTLY what's in Obsidian.
			
			let base64Content: string;
			
			if (file.extension === 'md') {
				let textContent = await this.app.vault.read(file);
				textContent = this.transformFrontmatter(textContent);
				// GitHub processing for assets would go here
				// eslint-disable-next-line no-undef
				base64Content = Buffer.from(textContent).toString('base64');
			} else {
				const binaryContent = await this.app.vault.readBinary(file);
				base64Content = arrayBufferToBase64(binaryContent);
			}

			const filePath = file.path;
			const message = `Update ${file.name}`;

			const owner = this.settings.githubOwner;
			const repo = this.settings.githubRepo;
			const branch = this.settings.githubBranch || 'main';

			const getUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${branch}`;
			let sha: string | undefined;

			try {
				const getResponse = await requestUrl({
					url: getUrl,
					method: "GET",
					headers: {
						"Authorization": `Bearer ${this.settings.githubToken}`,
						"Accept": "application/vnd.github.v3+json",
						"User-Agent": "Obsidian-Digital-Garden"
					},
					throw: false
				});

				if (getResponse.status === 200) {
					const data = getResponse.json as { sha: string };
					sha = data.sha;
				}
			} catch (e) {
				console.warn("Could not get SHA", e);
			}

			const putUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;

			const payload: GitHubPayload = {
				message,
				content: base64Content,
				branch
			};
			if (sha) payload.sha = sha;

			const putResponse = await requestUrl({
				url: putUrl,
				method: "PUT",
				headers: {
					"Authorization": `Bearer ${this.settings.githubToken}`,
					"Accept": "application/vnd.github.v3+json",
					"Content-Type": "application/json",
					"User-Agent": "Obsidian-Digital-Garden"
				},
				body: JSON.stringify(payload)
			});

			if (putResponse.status >= 200 && putResponse.status < 300) {
				return true;
			} else {
				console.error("GitHub publish failed", putResponse.status, putResponse.text);
				new Notice(`GitHub publish failed: ${putResponse.status}`);
				return false;
			}

		} catch (e) {
			console.error("Failed to publish file to GitHub", e);
			new Notice(`Failed to publish file to GitHub: ${(e as Error).message}`);
			return false;
		}
	}
}
