import { describe, it, expect, vi, beforeEach } from "vitest";
import { sanitizeFilename, isImageFile, processMarkdownAssets, computeSlug } from "./asset-processor";
import { TFile } from "obsidian";

// Mock TFile for testing
const createMockTFile = (path: string, name: string, extension: string, parent?: { name: string }): TFile => {
	const file = new TFile(path);
	file.name = name;
	file.basename = name.replace(`.${extension}`, "");
	file.extension = extension;
	file.parent = parent ? { name: parent.name } as TFile["parent"] : null;
	return file;
};

describe("sanitizeFilename", () => {
	it("should replace spaces with hyphens", () => {
		expect(sanitizeFilename("my image.png")).toBe("my-image.png");
	});

	it("should remove special characters", () => {
		expect(sanitizeFilename("image (1).png")).toBe("image-1.png");
	});

	it("should collapse multiple spaces to single hyphen", () => {
		// The implementation replaces \s+ with a single hyphen, which is better behavior
		expect(sanitizeFilename("my   image   file.png")).toBe("my-image-file.png");
	});

	it("should preserve alphanumeric, dots, hyphens, and underscores", () => {
		expect(sanitizeFilename("image_2024-01-15.test.png")).toBe("image_2024-01-15.test.png");
	});

	it("should handle unicode characters", () => {
		expect(sanitizeFilename("imágé.png")).toBe("img.png");
	});
});

describe("isImageFile", () => {
	it("should return true for png files", () => {
		const file = createMockTFile("test.png", "test.png", "png");
		expect(isImageFile(file)).toBe(true);
	});

	it("should return true for jpg files", () => {
		const file = createMockTFile("test.jpg", "test.jpg", "jpg");
		expect(isImageFile(file)).toBe(true);
	});

	it("should return true for jpeg files", () => {
		const file = createMockTFile("test.jpeg", "test.jpeg", "jpeg");
		expect(isImageFile(file)).toBe(true);
	});

	it("should return true for gif files", () => {
		const file = createMockTFile("test.gif", "test.gif", "gif");
		expect(isImageFile(file)).toBe(true);
	});

	it("should return true for svg files", () => {
		const file = createMockTFile("test.svg", "test.svg", "svg");
		expect(isImageFile(file)).toBe(true);
	});

	it("should return true for webp files", () => {
		const file = createMockTFile("test.webp", "test.webp", "webp");
		expect(isImageFile(file)).toBe(true);
	});

	it("should return false for markdown files", () => {
		const file = createMockTFile("test.md", "test.md", "md");
		expect(isImageFile(file)).toBe(false);
	});

	it("should return false for pdf files", () => {
		const file = createMockTFile("test.pdf", "test.pdf", "pdf");
		expect(isImageFile(file)).toBe(false);
	});

	it("should be case-insensitive", () => {
		const file = createMockTFile("test.PNG", "test.PNG", "PNG");
		expect(isImageFile(file)).toBe(true);
	});
});

describe("computeSlug", () => {
	it("should use filename as slug for regular files", () => {
		const file = createMockTFile("posts/my-post.md", "my-post.md", "md", { name: "posts" });
		expect(computeSlug(file)).toBe("my-post");
	});

	it("should use parent folder name for index.md files", () => {
		const file = createMockTFile("my-post/index.md", "index.md", "md", { name: "my-post" });
		expect(computeSlug(file)).toBe("my-post");
	});

	it("should sanitize special characters", () => {
		const file = createMockTFile("posts/my:post?.md", "my:post?.md", "md", { name: "posts" });
		expect(computeSlug(file)).toBe("my-post-");
	});

	it("should replace spaces with hyphens", () => {
		const file = createMockTFile("posts/my post.md", "my post.md", "md", { name: "posts" });
		expect(computeSlug(file)).toBe("my-post");
	});
});

describe("processMarkdownAssets", () => {
	// Create mock app with metadataCache
	const createMockApp = (fileMap: Record<string, TFile>) => ({
		metadataCache: {
			getFirstLinkpathDest: vi.fn((linkPath: string) => {
				return fileMap[linkPath] ?? null;
			}),
		},
		vault: {
			getFiles: vi.fn(() => Object.values(fileMap)),
		},
	});

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should extract wikilink images", () => {
		const imageFile = createMockTFile("images/test.png", "test.png", "png");
		const app = createMockApp({ "test.png": imageFile });

		const sourceFile = createMockTFile("posts/my-post.md", "my-post.md", "md");
		const content = "# Hello\n\n![[test.png]]\n\nMore content";

		const result = processMarkdownAssets(
			app as never,
			sourceFile,
			content,
			"src/content/posts/my-post"
		);

		expect(result.assets).toHaveLength(1);
		expect(result.assets[0]?.targetFilename).toBe("test.png");
		expect(result.assets[0]?.targetPath).toBe("src/content/posts/my-post/test.png");
		expect(result.rewrittenMarkdown).toContain("![test](test.png)");
		expect(result.rewrittenMarkdown).not.toContain("![[test.png]]");
	});

	it("should extract wikilink images with alt text", () => {
		const imageFile = createMockTFile("images/test.png", "test.png", "png");
		const app = createMockApp({ "test.png": imageFile });

		const sourceFile = createMockTFile("posts/my-post.md", "my-post.md", "md");
		const content = "![[test.png|my alt text]]";

		const result = processMarkdownAssets(
			app as never,
			sourceFile,
			content,
			"src/content/posts/my-post"
		);

		expect(result.assets).toHaveLength(1);
		expect(result.rewrittenMarkdown).toContain("![test](test.png)");
	});

	it("should extract markdown link images", () => {
		const imageFile = createMockTFile("images/photo.jpg", "photo.jpg", "jpg");
		const app = createMockApp({ "images/photo.jpg": imageFile });

		const sourceFile = createMockTFile("posts/my-post.md", "my-post.md", "md");
		const content = "![Alt text](images/photo.jpg)";

		const result = processMarkdownAssets(
			app as never,
			sourceFile,
			content,
			"src/content/posts/my-post"
		);

		expect(result.assets).toHaveLength(1);
		expect(result.assets[0]?.targetFilename).toBe("photo.jpg");
		expect(result.rewrittenMarkdown).toContain("![Alt text](photo.jpg)");
	});

	it("should skip external URLs", () => {
		const app = createMockApp({});

		const sourceFile = createMockTFile("posts/my-post.md", "my-post.md", "md");
		const content = "![External](https://example.com/image.png)";

		const result = processMarkdownAssets(
			app as never,
			sourceFile,
			content,
			"src/content/posts/my-post"
		);

		expect(result.assets).toHaveLength(0);
		expect(result.rewrittenMarkdown).toBe(content);
		expect(result.warnings).toHaveLength(0);
	});

	it("should skip http URLs", () => {
		const app = createMockApp({});

		const sourceFile = createMockTFile("posts/my-post.md", "my-post.md", "md");
		const content = "![External](http://example.com/image.png)";

		const result = processMarkdownAssets(
			app as never,
			sourceFile,
			content,
			"src/content/posts/my-post"
		);

		expect(result.assets).toHaveLength(0);
		expect(result.rewrittenMarkdown).toBe(content);
	});

	it("should add warning for missing files", () => {
		const app = createMockApp({});

		const sourceFile = createMockTFile("posts/my-post.md", "my-post.md", "md");
		const content = "![[missing.png]]";

		const result = processMarkdownAssets(
			app as never,
			sourceFile,
			content,
			"src/content/posts/my-post"
		);

		expect(result.assets).toHaveLength(0);
		expect(result.warnings).toContain("Could not resolve wikilink: missing.png");
	});

	it("should sanitize filenames with spaces", () => {
		const imageFile = createMockTFile("images/my image.png", "my image.png", "png");
		const app = createMockApp({ "my image.png": imageFile });

		const sourceFile = createMockTFile("posts/my-post.md", "my-post.md", "md");
		const content = "![[my image.png]]";

		const result = processMarkdownAssets(
			app as never,
			sourceFile,
			content,
			"src/content/posts/my-post"
		);

		expect(result.assets).toHaveLength(1);
		expect(result.assets[0]?.targetFilename).toBe("my-image.png");
		expect(result.rewrittenMarkdown).toContain("![my image](my-image.png)");
	});

	it("should handle multiple images", () => {
		const image1 = createMockTFile("images/one.png", "one.png", "png");
		const image2 = createMockTFile("images/two.jpg", "two.jpg", "jpg");
		const app = createMockApp({ "one.png": image1, "two.jpg": image2 });

		const sourceFile = createMockTFile("posts/my-post.md", "my-post.md", "md");
		const content = "![[one.png]]\n\nSome text\n\n![[two.jpg]]";

		const result = processMarkdownAssets(
			app as never,
			sourceFile,
			content,
			"src/content/posts/my-post"
		);

		expect(result.assets).toHaveLength(2);
	});

	it("should not duplicate assets when same file is linked twice", () => {
		const imageFile = createMockTFile("images/test.png", "test.png", "png");
		const app = createMockApp({ 
			"test.png": imageFile,
			"images/test.png": imageFile 
		});

		const sourceFile = createMockTFile("posts/my-post.md", "my-post.md", "md");
		const content = "![[test.png]]\n\n![Alt](images/test.png)";

		const result = processMarkdownAssets(
			app as never,
			sourceFile,
			content,
			"src/content/posts/my-post"
		);

		// Should only have one asset even though linked twice
		expect(result.assets).toHaveLength(1);
	});

	it("should skip data URIs", () => {
		const app = createMockApp({});

		const sourceFile = createMockTFile("posts/my-post.md", "my-post.md", "md");
		const content = "![Inline](data:image/png;base64,iVBORw0KGgo...)";

		const result = processMarkdownAssets(
			app as never,
			sourceFile,
			content,
			"src/content/posts/my-post"
		);

		expect(result.assets).toHaveLength(0);
		expect(result.rewrittenMarkdown).toBe(content);
	});
});
