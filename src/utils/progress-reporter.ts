import { Notice } from "obsidian";

/**
 * Summary of a publish operation
 */
export interface PublishSummary {
	/** Number of posts successfully published */
	postsPublished: number;
	/** Number of assets uploaded */
	assetsUploaded: number;
	/** Number of assets skipped (identical content) */
	assetsSkipped: number;
	/** Number of files deleted (stale content) */
	filesDeleted: number;
	/** Number of posts skipped (not marked for publish) */
	postsSkipped: number;
	/** Number of posts with validation errors */
	postsInvalid: number;
	/** Warning messages */
	warnings: string[];
	/** Error messages */
	errors: string[];
}

/**
 * Create an empty publish summary
 */
export function createEmptySummary(): PublishSummary {
	return {
		postsPublished: 0,
		assetsUploaded: 0,
		assetsSkipped: 0,
		filesDeleted: 0,
		postsSkipped: 0,
		postsInvalid: 0,
		warnings: [],
		errors: [],
	};
}

/**
 * Progress reporter for publish operations.
 * Provides throttled UI feedback using Obsidian's Notice API.
 */
export class ProgressReporter {
	private total = 0;
	private current = 0;
	private lastUpdateTime = 0;
	private currentNotice: Notice | null = null;
	private readonly throttleMs = 500; // Minimum time between UI updates

	/**
	 * Start tracking progress for a batch operation
	 */
	start(total: number, message?: string): void {
		this.total = total;
		this.current = 0;
		this.lastUpdateTime = 0;

		const displayMessage = message ?? `Publishing ${total} files...`;
		this.showNotice(displayMessage, 0);
	}

	/**
	 * Update progress with a message.
	 * Throttled to prevent UI spam.
	 */
	update(message: string): void {
		this.current++;

		const now = Date.now();
		if (now - this.lastUpdateTime < this.throttleMs) {
			return;
		}

		this.lastUpdateTime = now;
		const progress = this.total > 0 ? Math.round((this.current / this.total) * 100) : 0;
		this.showNotice(`[${progress}%] ${message}`, 0);
	}

	/**
	 * Increment the current count without showing a message.
	 * Useful for batch updates.
	 */
	increment(): void {
		this.current++;
	}

	/**
	 * Show a status message (throttled)
	 */
	status(message: string): void {
		const now = Date.now();
		if (now - this.lastUpdateTime < this.throttleMs) {
			return;
		}

		this.lastUpdateTime = now;
		const progress = this.total > 0 ? Math.round((this.current / this.total) * 100) : 0;
		this.showNotice(`[${progress}%] ${message}`, 0);
	}

	/**
	 * Show completion summary
	 */
	complete(summary: PublishSummary): void {
		// Hide the progress notice
		if (this.currentNotice) {
			this.currentNotice.hide();
			this.currentNotice = null;
		}

		// Build summary message
		const parts: string[] = [];

		if (summary.postsPublished > 0) {
			parts.push(`${summary.postsPublished} published`);
		}

		if (summary.assetsUploaded > 0) {
			parts.push(`${summary.assetsUploaded} assets`);
		}

		if (summary.assetsSkipped > 0) {
			parts.push(`${summary.assetsSkipped} unchanged`);
		}

		if (summary.filesDeleted > 0) {
			parts.push(`${summary.filesDeleted} deleted`);
		}

		if (summary.postsSkipped > 0) {
			parts.push(`${summary.postsSkipped} skipped`);
		}

		if (summary.postsInvalid > 0) {
			parts.push(`${summary.postsInvalid} invalid`);
		}

		const mainMessage = parts.length > 0
			? `Publish complete: ${parts.join(", ")}`
			: "Publish complete: no changes";

		// Show success notice (auto-dismiss after 5s)
		new Notice(mainMessage, 5000);

		// Show warnings if any (separate notices, longer duration)
		if (summary.warnings.length > 0) {
			const warningCount = summary.warnings.length;
			const warningPreview = summary.warnings.slice(0, 3).join("; ");
			const warningMsg = warningCount > 3
				? `Warnings (${warningCount}): ${warningPreview}... (see console)`
				: `Warnings: ${warningPreview}`;
			new Notice(warningMsg, 8000);

			// Log all warnings to console
			console.warn("Publish warnings:", summary.warnings);
		}

		// Show errors if any
		if (summary.errors.length > 0) {
			const errorCount = summary.errors.length;
			const errorPreview = summary.errors.slice(0, 2).join("; ");
			const errorMsg = errorCount > 2
				? `Errors (${errorCount}): ${errorPreview}... (see console)`
				: `Errors: ${errorPreview}`;
			new Notice(errorMsg, 10000);

			// Log all errors to console
			console.error("Publish errors:", summary.errors);
		}
	}

	/**
	 * Show an error message (not throttled)
	 */
	error(message: string): void {
		new Notice(`Error: ${message}`, 8000);
		console.error("Publish error:", message);
	}

	/**
	 * Show a warning message (not throttled)
	 */
	warn(message: string): void {
		console.warn("Publish warning:", message);
	}

	/**
	 * Internal helper to show/update a notice
	 */
	private showNotice(message: string, duration: number): void {
		if (this.currentNotice) {
			this.currentNotice.hide();
		}
		this.currentNotice = new Notice(message, duration);
	}
}

