/* eslint-disable obsidianmd/ui/sentence-case */
import { App, PluginSettingTab, Setting } from "obsidian";
import DigitalGardenPlugin from "./main";

export interface DigitalGardenSettings {
	// GitHub repository settings
	githubOwner: string;
	githubRepo: string;
	githubBranch: string;
	githubToken: string;

	// Local publishing settings
	localOutputPath: string;

	// Astro content structure settings
	contentDirectory: string;

	// Sync settings
	enableSync: boolean;
}

export const DEFAULT_SETTINGS: DigitalGardenSettings = {
	githubOwner: "",
	githubRepo: "",
	githubBranch: "main",
	githubToken: "",
	localOutputPath: "",
	contentDirectory: "src/content/posts",
	enableSync: true,
};

export class DigitalGardenSettingTab extends PluginSettingTab {
	plugin: DigitalGardenPlugin;

	constructor(app: App, plugin: DigitalGardenPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		// GitHub Section
		new Setting(containerEl).setName("GitHub").setHeading();

		new Setting(containerEl)
			.setName("Owner")
			.setDesc("The username or organization that owns the repository")
			.addText((text) =>
				text
					.setPlaceholder("your-username")
					.setValue(this.plugin.settings.githubOwner)
					.onChange(async (value) => {
						this.plugin.settings.githubOwner = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Repository")
			.setDesc("The name of your Astro blog repository")
			.addText((text) =>
				text
					.setPlaceholder("my-digital-garden")
					.setValue(this.plugin.settings.githubRepo)
					.onChange(async (value) => {
						this.plugin.settings.githubRepo = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Branch")
			.setDesc("The branch to publish to")
			.addText((text) =>
				text
					.setPlaceholder("main")
					.setValue(this.plugin.settings.githubBranch)
					.onChange(async (value) => {
						this.plugin.settings.githubBranch = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Token")
			.setDesc("Personal access token with repo scope (contents:write permission)")
			.addText((text) =>
				text
					.setPlaceholder("ghp_...")
					.setValue(this.plugin.settings.githubToken)
					.onChange(async (value) => {
						this.plugin.settings.githubToken = value;
						await this.plugin.saveSettings();
					})
			);

		// Astro Structure Section
		new Setting(containerEl).setName("Astro structure").setHeading();

		new Setting(containerEl)
			.setName("Content directory")
			.setDesc(
				"Path within the repo where posts are stored (e.g., src/content/posts)"
			)
			.addText((text) =>
				text
					.setPlaceholder("src/content/posts")
					.setValue(this.plugin.settings.contentDirectory)
					.onChange(async (value) => {
						this.plugin.settings.contentDirectory = value;
						await this.plugin.saveSettings();
					})
			);

		// Sync Section
		new Setting(containerEl).setName("Sync").setHeading();

		new Setting(containerEl)
			.setName("Enable sync")
			.setDesc(
				"When enabled, posts and assets removed from Obsidian will be deleted from GitHub. A manifest file tracks published content."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableSync)
					.onChange(async (value) => {
						this.plugin.settings.enableSync = value;
						await this.plugin.saveSettings();
					})
			);

		// Local Development Section
		new Setting(containerEl).setName("Local development").setHeading();

		new Setting(containerEl)
			.setName("Local output path")
			.setDesc(
				"Absolute path to your local Astro content folder for testing (optional)"
			)
			.addText((text) =>
				text
					.setPlaceholder("/Users/you/projects/my-garden/src/content/posts")
					.setValue(this.plugin.settings.localOutputPath)
					.onChange(async (value) => {
						this.plugin.settings.localOutputPath = value;
						await this.plugin.saveSettings();
					})
			);

		// Help Section
		new Setting(containerEl).setName("Help").setHeading();

		const helpEl = containerEl.createEl("div", { cls: "setting-item-description" });
		helpEl.createEl("p", {
			text: "To publish a note, add the following frontmatter:",
		});

		const codeBlock = helpEl.createEl("pre");
		codeBlock.createEl("code", {
			text: `---
title: My post title
date: 2024-01-15
publish: true
---`,
		});

		helpEl.createEl("p", {
			text: "Then run the \"Publish to site\" command from the command palette.",
		});
	}
}
/* eslint-enable obsidianmd/ui/sentence-case */
