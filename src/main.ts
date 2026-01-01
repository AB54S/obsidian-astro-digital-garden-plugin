import { moment, Notice, Plugin } from 'obsidian';
import { DEFAULT_SETTINGS, DigitalGardenSettings, DigitalGardenSettingTab } from "./settings";
import { NewPostModal } from "./ui/new-post-modal";
import { Publisher } from "./utils/publisher";
import { FrontmatterValidator } from "./utils/validator";

export default class DigitalGardenPlugin extends Plugin {
	settings: DigitalGardenSettings;
	publisher: Publisher;

	async onload() {
		await this.loadSettings();
		this.publisher = new Publisher(this.app, this.settings);

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new DigitalGardenSettingTab(this.app, this));

		this.addCommand({
			id: 'publish-to-site',
			name: 'Publish to site',
			callback: async () => {
				await this.publishAllFiles();
			}
		});

		this.addCommand({
			id: 'create-new-post',
			name: 'Create new blog post',
			callback: () => {
				new NewPostModal(this.app, (title) => {
					this.createNewPost(title).catch(console.error);
				}).open();
			}
		});

		this.addRibbonIcon('file-plus', 'New blog post', () => {
			new NewPostModal(this.app, (title) => {
				this.createNewPost(title).catch(console.error);
			}).open();
		});
	}

	async createNewPost(title: string) {
		if (!title) {
			new Notice('Post title is required');
			return;
		}

		// Sanitize title for filename
		const slug = title.replace(/[\\/:*?"<>|]/g, '-');
		
		try {
			// 1. Create Folder
			await this.app.vault.createFolder(slug);

			// 2. Create index.md inside
			const filepath = `${slug}/index.md`;
			const content = `---
title: ${title}
date: ${moment().format('YYYY-MM-DD')}
publish: true
---

`;
			const file = await this.app.vault.create(filepath, content);
			
			// 3. Open the new file
			await this.app.workspace.getLeaf(true).openFile(file);
			
			new Notice(`Created new post: ${title}`);
		} catch (error) {
			new Notice(`Failed to create post: ${(error as Error).message}`);
			console.error(error);
		}
	}

	async publishAllFiles() {
		const files = this.app.vault.getMarkdownFiles();
		let successCount = 0;
		let failCount = 0;
		let invalidCount = 0;
		let skippedCount = 0;

		new Notice(`Starting publish for ${files.length} files...`);

		for (const file of files) {
			const metadata = this.app.metadataCache.getFileCache(file);
			const validation = FrontmatterValidator.validate(file, metadata);

			if (validation.ignore) {
				skippedCount++;
				continue;
			}

			if (!validation.isValid) {
				console.warn(`Skipping ${file.path}: ${validation.errors.join(", ")}`);
				new Notice(`Skipping ${file.name}: ${validation.errors.join(", ")}`);
				invalidCount++;
				continue;
			}

			const success = await this.publisher.publish(file);
			if (success) {
				successCount++;
			} else {
				failCount++;
			}
		}

		new Notice(`Publish complete: ${successCount} published, ${invalidCount} invalid, ${failCount} failed. (${skippedCount} skipped/ignored)`);
	}

	onunload() {
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<DigitalGardenSettings>);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
