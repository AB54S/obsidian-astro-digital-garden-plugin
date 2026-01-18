/**
 * Mock implementations of Obsidian types for testing.
 * These are minimal stubs that allow tests to import from "obsidian".
 */

export class TFile {
	path: string;
	name: string;
	basename: string;
	extension: string;
	parent: { name: string } | null;

	constructor(path: string) {
		this.path = path;
		this.name = path.split("/").pop() ?? "";
		this.extension = this.name.split(".").pop() ?? "";
		this.basename = this.name.replace(`.${this.extension}`, "");
		this.parent = null;
	}
}

export class TFolder {
	path: string;
	name: string;

	constructor(path: string) {
		this.path = path;
		this.name = path.split("/").pop() ?? "";
	}
}

export class App {
	vault: Vault;
	metadataCache: MetadataCache;

	constructor() {
		this.vault = new Vault();
		this.metadataCache = new MetadataCache();
	}
}

export class Vault {
	getFiles(): TFile[] {
		return [];
	}

	getMarkdownFiles(): TFile[] {
		return [];
	}

	read(_file: TFile): Promise<string> {
		return Promise.resolve("");
	}

	readBinary(_file: TFile): Promise<ArrayBuffer> {
		return Promise.resolve(new ArrayBuffer(0));
	}

	create(_path: string, _content: string): Promise<TFile> {
		return Promise.resolve(new TFile(_path));
	}

	createFolder(_path: string): Promise<void> {
		return Promise.resolve();
	}
}

export class MetadataCache {
	getFileCache(_file: TFile): CachedMetadata | null {
		return null;
	}

	getFirstLinkpathDest(_linkPath: string, _sourcePath: string): TFile | null {
		return null;
	}
}

export interface CachedMetadata {
	frontmatter?: Record<string, unknown>;
}

export class Notice {
	constructor(_message: string, _duration?: number) {
		// Mock notice - does nothing in tests
	}

	hide(): void {
		// Mock hide
	}
}

export class Modal {
	app: App;
	contentEl: HTMLElement;

	constructor(app: App) {
		this.app = app;
		this.contentEl = document.createElement("div");
	}

	open(): void {
		// Mock open
	}

	close(): void {
		// Mock close
	}
}

export class Plugin {
	app: App;
	manifest: PluginManifest;

	constructor() {
		this.app = new App();
		this.manifest = { id: "test", name: "Test", version: "1.0.0" } as PluginManifest;
	}

	loadData(): Promise<unknown> {
		return Promise.resolve({});
	}

	saveData(_data: unknown): Promise<void> {
		return Promise.resolve();
	}

	addCommand(_command: Command): Command {
		return _command;
	}

	addRibbonIcon(_icon: string, _title: string, _callback: () => void): HTMLElement {
		return document.createElement("div");
	}

	addSettingTab(_tab: PluginSettingTab): void {
		// Mock
	}
}

export class PluginSettingTab {
	app: App;
	plugin: Plugin;
	containerEl: HTMLElement;

	constructor(app: App, plugin: Plugin) {
		this.app = app;
		this.plugin = plugin;
		this.containerEl = document.createElement("div");
	}

	display(): void {
		// Mock display
	}

	hide(): void {
		// Mock hide
	}
}

export class Setting {
	constructor(_containerEl: HTMLElement) {
		// Mock setting
	}

	setName(_name: string): this {
		return this;
	}

	setDesc(_desc: string): this {
		return this;
	}

	addText(_cb: (text: TextComponent) => void): this {
		return this;
	}

	addToggle(_cb: (toggle: ToggleComponent) => void): this {
		return this;
	}

	addButton(_cb: (button: ButtonComponent) => void): this {
		return this;
	}
}

export interface TextComponent {
	setValue(value: string): this;
	setPlaceholder(placeholder: string): this;
	onChange(callback: (value: string) => void): this;
}

export interface ToggleComponent {
	setValue(value: boolean): this;
	onChange(callback: (value: boolean) => void): this;
}

export interface ButtonComponent {
	setButtonText(text: string): this;
	setCta(): this;
	onClick(callback: () => void): this;
}

export interface Command {
	id: string;
	name: string;
	callback?: () => void;
}

export interface PluginManifest {
	id: string;
	name: string;
	version: string;
}

export function requestUrl(_options: RequestUrlParam): Promise<RequestUrlResponse> {
	return Promise.resolve({
		status: 200,
		headers: {},
		arrayBuffer: new ArrayBuffer(0),
		json: {},
		text: "",
	});
}

export interface RequestUrlParam {
	url: string;
	method?: string;
	headers?: Record<string, string>;
	body?: string;
	throw?: boolean;
}

export interface RequestUrlResponse {
	status: number;
	headers: Record<string, string>;
	arrayBuffer: ArrayBuffer;
	json: unknown;
	text: string;
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer);
	let binary = "";
	for (let i = 0; i < bytes.byteLength; i++) {
		binary += String.fromCharCode(bytes[i]!);
	}
	return btoa(binary);
}

// Moment.js mock
export const moment = (date?: string | Date) => {
	const d = date ? new Date(date) : new Date();
	return {
		format: (fmt: string) => {
			if (fmt === "YYYY-MM-DD") {
				return d.toISOString().split("T")[0];
			}
			return d.toISOString();
		},
	};
};

