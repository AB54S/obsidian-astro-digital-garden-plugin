import { App, Modal, Setting } from "obsidian";

export class NewPostModal extends Modal {
	result: string;
	onSubmit: (title: string) => void;

	constructor(app: App, onSubmit: (title: string) => void) {
		super(app);
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const { contentEl } = this;

		contentEl.createEl("h2", { text: "Create new blog post" });

		new Setting(contentEl)
			.setName("Post title")
			.setDesc("The title of your new blog post")
			.addText((text) =>
				text
					.setPlaceholder("My awesome post")
					.onChange((value) => {
						this.result = value;
					})
			);

		new Setting(contentEl)
			.addButton((btn) =>
				btn
					.setButtonText("Create")
					.setCta()
					.onClick(() => {
						this.close();
						this.onSubmit(this.result);
					})
			);
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
