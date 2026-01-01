import { App, PluginSettingTab, Setting } from "obsidian";
import DigitalGardenPlugin from "./main";

export interface DigitalGardenSettings {
	githubOwner: string;
	githubRepo: string;
	githubBranch: string;
	githubToken: string;
	localOutputPath: string;
}

export const DEFAULT_SETTINGS: DigitalGardenSettings = {
	githubOwner: '',
	githubRepo: '',
	githubBranch: 'main',
	githubToken: '',
	localOutputPath: ''
}

export class DigitalGardenSettingTab extends PluginSettingTab {
	plugin: DigitalGardenPlugin;

	constructor(app: App, plugin: DigitalGardenPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('GitHub owner')
			.setDesc('The username or organization name of the GitHub repository')
			.addText(text => text
				.setPlaceholder('Octocat')
				.setValue(this.plugin.settings.githubOwner)
				.onChange(async (value) => {
					this.plugin.settings.githubOwner = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('GitHub repository')
			.setDesc('The name of the GitHub repository')
			.addText(text => text
				.setPlaceholder('My-digital-garden')
				.setValue(this.plugin.settings.githubRepo)
				.onChange(async (value) => {
					this.plugin.settings.githubRepo = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('GitHub branch')
			.setDesc('The branch to push to')
			.addText(text => text
				.setPlaceholder('Main')
				.setValue(this.plugin.settings.githubBranch)
				.onChange(async (value) => {
					this.plugin.settings.githubBranch = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('GitHub token')
			.setDesc('Personal access token with repo scope')
			.addText(text => text
				// eslint-disable-next-line obsidianmd/ui/sentence-case
				.setPlaceholder('ghp_...')
				.setValue(this.plugin.settings.githubToken)
				.onChange(async (value) => {
					this.plugin.settings.githubToken = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Local output path')
			// eslint-disable-next-line obsidianmd/ui/sentence-case
			.setDesc('Absolute path to the Astro "src/content/posts" folder (for local testing)')
			.addText(text => text
				// eslint-disable-next-line obsidianmd/ui/sentence-case
				.setPlaceholder('/Users/me/projects/my-garden/src/content/posts')
				.setValue(this.plugin.settings.localOutputPath)
				.onChange(async (value) => {
					this.plugin.settings.localOutputPath = value;
					await this.plugin.saveSettings();
				}));
	}
}
