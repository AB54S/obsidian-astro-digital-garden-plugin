import { App, TFile } from "obsidian";

/**
 * Represents a resolved asset reference found in markdown content.
 */
export interface AssetReference {
    /** The resolved file in the vault */
    vaultFile: TFile;
    /** The original link text as it appears in markdown */
    originalLink: string;
    /** Sanitized filename for the destination */
    targetFilename: string;
    /** Full path in target repo (e.g., "src/content/posts/my-post/image.png") */
    targetPath: string;
}

/**
 * Result of processing markdown content for assets.
 */
export interface ProcessedContent {
    /** Markdown with image links rewritten to target paths */
    rewrittenMarkdown: string;
    /** List of assets that need to be copied/uploaded */
    assets: AssetReference[];
    /** Warnings for missing files, unsupported formats, etc. */
    warnings: string[];
}

// Supported image extensions
const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "svg", "webp", "avif", "bmp", "ico"];

/**
 * Check if a file is an image based on its extension.
 */
export function isImageFile(file: TFile): boolean {
    return IMAGE_EXTENSIONS.includes(file.extension.toLowerCase());
}

/**
 * Sanitize a filename for safe use in URLs and file systems.
 * Replaces spaces with hyphens and removes special characters.
 */
export function sanitizeFilename(filename: string): string {
    return filename
        .replace(/\s+/g, "-")
        .replace(/[^a-zA-Z0-9._-]/g, "");
}

/**
 * Process markdown content to extract asset references and rewrite links.
 * 
 * Handles both Obsidian wikilinks (![[image.png]]) and standard markdown links (![alt](path.png)).
 * External URLs (http/https) are skipped.
 * 
 * @param app - The Obsidian App instance for vault access
 * @param sourceFile - The markdown file being processed
 * @param content - The raw markdown content
 * @param targetDirectory - The destination directory path (e.g., "src/content/posts/my-post")
 * @returns ProcessedContent with rewritten markdown, asset list, and warnings
 */
export function processMarkdownAssets(
    app: App,
    sourceFile: TFile,
    content: string,
    targetDirectory: string
): ProcessedContent {
    const assets: AssetReference[] = [];
    const warnings: string[] = [];
    let rewrittenMarkdown = content;

    // Track processed links to avoid duplicates
    const processedLinks = new Map<string, string>();

    // 1. Process Obsidian wikilinks: ![[image.png]] or ![[image.png|alt text]]
    const wikilinkRegex = /!\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g;
    let match;

    while ((match = wikilinkRegex.exec(content)) !== null) {
        const fullMatch = match[0];
        const linkText = match[1];

        if (!linkText) continue;

        // Skip if already processed (same link appears multiple times)
        if (processedLinks.has(fullMatch)) {
            rewrittenMarkdown = rewrittenMarkdown.replace(
                fullMatch,
                processedLinks.get(fullMatch)!
            );
            continue;
        }

        const linkedFile = app.metadataCache.getFirstLinkpathDest(linkText, sourceFile.path);

        if (!linkedFile) {
            warnings.push(`Could not resolve wikilink: ${linkText}`);
            continue;
        }

        if (!(linkedFile instanceof TFile)) {
            warnings.push(`Link resolves to folder, not file: ${linkText}`);
            continue;
        }

        if (!isImageFile(linkedFile)) {
            // Non-image wikilinks are left as-is (could be internal note links)
            continue;
        }

        const sanitizedName = sanitizeFilename(linkedFile.name);
        const targetPath = `${targetDirectory}/${sanitizedName}`;

        assets.push({
            vaultFile: linkedFile,
            originalLink: fullMatch,
            targetFilename: sanitizedName,
            targetPath,
        });

        // Replace with standard markdown link (relative path for co-located assets)
        const replacement = `![${linkedFile.basename}](${sanitizedName})`;
        processedLinks.set(fullMatch, replacement);
        rewrittenMarkdown = rewrittenMarkdown.replace(fullMatch, replacement);
    }

    // 2. Process standard markdown links: ![alt](path/to/image.png)
    const mdLinkRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;

    while ((match = mdLinkRegex.exec(content)) !== null) {
        const fullMatch = match[0];
        const altText = match[1] ?? "";
        const linkPath = match[2];

        if (!linkPath) continue;

        // Skip external URLs
        if (linkPath.startsWith("http://") || linkPath.startsWith("https://")) {
            continue;
        }

        // Skip data URIs
        if (linkPath.startsWith("data:")) {
            continue;
        }

        // Skip if already processed
        if (processedLinks.has(fullMatch)) {
            const cached = processedLinks.get(fullMatch);
            if (cached) {
                rewrittenMarkdown = rewrittenMarkdown.replace(fullMatch, cached);
            }
            continue;
        }

        // Try to resolve the file
        let linkedFile = app.metadataCache.getFirstLinkpathDest(
            decodeURIComponent(linkPath),
            sourceFile.path
        );

        // Fallback: try finding by filename only if path lookup fails
        if (!linkedFile) {
            const nameOnly = linkPath.split("/").pop();
            if (nameOnly) {
                const files = app.vault.getFiles();
                linkedFile = files.find((f) => f.name === decodeURIComponent(nameOnly)) ?? null;
            }
        }

        if (!linkedFile) {
            warnings.push(`Could not resolve image link: ${linkPath}`);
            continue;
        }

        if (!(linkedFile instanceof TFile)) {
            warnings.push(`Link resolves to folder, not file: ${linkPath}`);
            continue;
        }

        if (!isImageFile(linkedFile)) {
            // Non-image markdown links are left as-is
            continue;
        }

        const sanitizedName = sanitizeFilename(linkedFile.name);
        const targetPath = `${targetDirectory}/${sanitizedName}`;

        // Check if this asset was already added (same file, different link syntax)
        const existingAsset = assets.find((a) => a.vaultFile.path === linkedFile.path);
        if (!existingAsset) {
            assets.push({
                vaultFile: linkedFile,
                originalLink: fullMatch,
                targetFilename: sanitizedName,
                targetPath,
            });
        }

        // Replace with updated markdown link
        const replacement = `![${altText}](${sanitizedName})`;
        processedLinks.set(fullMatch, replacement);
        rewrittenMarkdown = rewrittenMarkdown.replace(fullMatch, replacement);
    }

    return {
        rewrittenMarkdown,
        assets,
        warnings,
    };
}

/**
 * Compute a slug from a file, using the parent folder name if the file is index.md
 */
export function computeSlug(file: TFile): string {
    let slug = file.basename;
    if (slug.toLowerCase() === "index" && file.parent) {
        slug = file.parent.name;
    }
    // Sanitize the slug for URL safety
    return slug.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, "-");
}

