import { CachedMetadata, TFile } from "obsidian";

export interface ValidationResult {
	isValid: boolean;
	ignore: boolean; 
	errors: string[];
}

export class FrontmatterValidator {
	static validate(file: TFile, metadata: CachedMetadata | null): ValidationResult {
		const errors: string[] = [];

		if (!metadata || !metadata.frontmatter) {
			return { isValid: false, ignore: true, errors: ["No frontmatter found"] };
		}

		const { title, date, publish, draft } = metadata.frontmatter;

		// Unified Logic:
		// 1. If 'draft' is TRUE, ignore.
		// 2. If 'publish' is explicitly FALSE, ignore.
		// 3. If neither is present, usually ignore (safe default), UNLESS user explicitly wants to publish everything. 
		//    For now, we require EITHER publish: true OR draft: false (explicitly).
		
		const isDraft = draft === true;
		const isPublished = publish === true;
		const isExplicitlyNotDraft = draft === false;

		// If it's a draft, ignore it immediately
		if (isDraft) {
			return { isValid: false, ignore: true, errors: ["Marked as draft"] };
		}

		// If it's NOT marked as published AND NOT explicitly marked as non-draft, ignore it.
		// (This effectively means you need publish: true OR draft: false to trigger publish)
		if (!isPublished && !isExplicitlyNotDraft) {
			return { isValid: false, ignore: true, errors: ["Not marked for publishing"] };
		}

		// 2. Validate required fields for Astro
		if (!title) {
			errors.push("Missing 'title' property");
		}

		if (!date) {
			errors.push("Missing 'date' property");
		}

		return {
			isValid: errors.length === 0,
			ignore: false,
			errors
		};
	}
}
