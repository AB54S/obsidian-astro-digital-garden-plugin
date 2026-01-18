import { moment, Notice, Plugin } from "obsidian";
import { DEFAULT_SETTINGS, DigitalGardenSettings, DigitalGardenSettingTab } from "./settings";
import { NewPostModal } from "./ui/new-post-modal";
import { Publisher } from "./utils/publisher";
import { ProgressReporter } from "./utils/progress-reporter";

export default class DigitalGardenPlugin extends Plugin {
	settings: DigitalGardenSettings;
	publisher: Publisher;

	async onload() {
		await this.loadSettings();
		this.publisher = new Publisher(this.app, this.settings);

		// Add settings tab
		this.addSettingTab(new DigitalGardenSettingTab(this.app, this));

		// Command: Publish all eligible files
		this.addCommand({
			id: "publish-to-site",
			name: "Publish to site",
			callback: async () => {
				await this.publishAllFiles();
			},
		});

		// Command: Create new blog post
		this.addCommand({
			id: "create-new-post",
			name: "Create new blog post",
			callback: () => {
				new NewPostModal(this.app, (title) => {
					this.createNewPost(title).catch(console.error);
				}).open();
			},
		});

		// Ribbon icon: Create new blog post
		this.addRibbonIcon("file-plus", "New blog post", () => {
			new NewPostModal(this.app, (title) => {
				this.createNewPost(title).catch(console.error);
			}).open();
		});
	}

	/**
	 * Create a new blog post with the given title
	 */
	async createNewPost(title: string) {
		if (!title) {
			new Notice("Post title is required");
			return;
		}

		// Sanitize title for filename
		const slug = title.replace(/[\\/:*?"<>|]/g, "-");

		try {
			// Create folder for the post
			await this.app.vault.createFolder(slug);

			// Create index.md inside
			const filepath = `${slug}/index.md`;
			const content = `---
title: ${title}
date: ${moment().format("YYYY-MM-DD")}
publish: true
---

`;
			const file = await this.app.vault.create(filepath, content);

			// Open the new file
			await this.app.workspace.getLeaf(true).openFile(file);

			new Notice(`Created new post: ${title}`);
		} catch (error) {
			new Notice(`Failed to create post: ${(error as Error).message}`);
			console.error(error);
		}
	}

	/**
	 * Publish all eligible files to configured destinations
	 */
	async publishAllFiles() {
		const files = this.app.vault.getMarkdownFiles();

		if (files.length === 0) {
			// eslint-disable-next-line obsidianmd/ui/sentence-case
			new Notice("No markdown files found");
			return;
		}

		// Check if any publish target is configured
		const hasGitHub =
			this.settings.githubOwner &&
			this.settings.githubRepo &&
			this.settings.githubToken;
		const hasLocal = this.settings.localOutputPath;

		if (!hasGitHub && !hasLocal) {
			new Notice(
				"No publish destination configured"
			);
			return;
		}

		const reporter = new ProgressReporter();

		try {
			await this.publisher.publishAll(files, reporter);
		} catch (error) {
			const err = error as Error;
			new Notice(`Publish failed: ${err.message}`);
			console.error("Publish error:", error);
		}
	}

	onunload() {
		// Cleanup if needed
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<DigitalGardenSettings>
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
		// Update publisher with new settings
		if (this.publisher) {
			this.publisher.updateSettings(this.settings);
		}
	}
}
