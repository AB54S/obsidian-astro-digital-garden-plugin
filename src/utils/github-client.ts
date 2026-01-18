import { arrayBufferToBase64, requestUrl } from "obsidian";

/**
 * Result of a file upload operation
 */
export interface UploadResult {
    /** Whether the file was actually uploaded (false if skipped due to identical content) */
    uploaded: boolean;
    /** The SHA of the file after the operation */
    sha: string;
    /** The path of the file in the repo */
    path: string;
}

/**
 * Represents a file in a GitHub repository
 */
export interface GitHubFile {
    name: string;
    path: string;
    sha: string;
    type: "file" | "dir";
}

/**
 * Configuration for the GitHub client
 */
export interface GitHubClientConfig {
    owner: string;
    repo: string;
    branch: string;
    token: string;
}

/**
 * Bounded concurrency limiter for rate limiting
 */
class ConcurrencyLimiter {
    private running = 0;
    private queue: Array<() => void> = [];

    constructor(private maxConcurrent: number) { }

    async acquire(): Promise<void> {
        if (this.running < this.maxConcurrent) {
            this.running++;
            return;
        }

        return new Promise((resolve) => {
            this.queue.push(() => {
                this.running++;
                resolve();
            });
        });
    }

    release(): void {
        this.running--;
        const next = this.queue.shift();
        if (next) {
            next();
        }
    }
}

/**
 * Compute Git blob SHA for content.
 * Git blob SHA = SHA-1("blob {size}\0{content}")
 * 
 * Note: This is a simplified implementation that works for text content.
 * For binary files, we rely on the GitHub API's SHA comparison.
 */
async function computeGitBlobSha(content: string | ArrayBuffer): Promise<string> {
    let bytes: Uint8Array;

    if (typeof content === "string") {
        const encoder = new TextEncoder();
        bytes = encoder.encode(content);
    } else {
        bytes = new Uint8Array(content);
    }

    const header = `blob ${bytes.length}\0`;
    const headerBytes = new TextEncoder().encode(header);

    const combined = new Uint8Array(headerBytes.length + bytes.length);
    combined.set(headerBytes);
    combined.set(bytes, headerBytes.length);

    const hashBuffer = await crypto.subtle.digest("SHA-1", combined);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Sleep for a specified duration
 */
function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * GitHub API client with idempotent uploads and rate limiting.
 * Uses Obsidian's requestUrl for network requests.
 */
export class GitHubClient {
    private config: GitHubClientConfig;
    private limiter: ConcurrencyLimiter;
    private baseUrl: string;

    constructor(config: GitHubClientConfig) {
        this.config = config;
        this.limiter = new ConcurrencyLimiter(5); // Max 5 concurrent requests
        this.baseUrl = `https://api.github.com/repos/${config.owner}/${config.repo}`;
    }

    /**
     * Make a request with rate limiting and retry logic
     */
    private async request<T>(
        method: "GET" | "PUT" | "DELETE",
        path: string,
        body?: unknown,
        retries = 3
    ): Promise<{ status: number; data: T | null }> {
        await this.limiter.acquire();

        try {
            let lastError: Error | null = null;
            let backoffMs = 1000;

            for (let attempt = 0; attempt < retries; attempt++) {
                try {
                    const response = await requestUrl({
                        url: `${this.baseUrl}${path}`,
                        method,
                        headers: {
                            Authorization: `Bearer ${this.config.token}`,
                            Accept: "application/vnd.github.v3+json",
                            "Content-Type": "application/json",
                            "User-Agent": "Obsidian-Digital-Garden",
                        },
                        body: body ? JSON.stringify(body) : undefined,
                        throw: false,
                    });

                    // Success
                    if (response.status >= 200 && response.status < 300) {
                        return {
                            status: response.status,
                            data: response.json as T,
                        };
                    }

                    // Not found is not an error for GET operations
                    if (response.status === 404) {
                        return { status: 404, data: null };
                    }

                    // Rate limited - retry with backoff
                    if (response.status === 403 || response.status === 429) {
                        const retryAfter = response.headers["retry-after"];
                        const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : backoffMs;
                        console.warn(
                            `GitHub rate limit hit, waiting ${waitTime}ms before retry (attempt ${attempt + 1}/${retries})`
                        );
                        await sleep(Math.min(waitTime, 30000)); // Cap at 30s
                        backoffMs *= 2;
                        continue;
                    }

                    // Other errors
                    lastError = new Error(`GitHub API error: ${response.status} - ${response.text}`);
                } catch (e) {
                    lastError = e as Error;
                    console.warn(`Request failed, retrying (attempt ${attempt + 1}/${retries}):`, e);
                    await sleep(backoffMs);
                    backoffMs *= 2;
                }
            }

            throw lastError ?? new Error("Request failed after retries");
        } finally {
            this.limiter.release();
        }
    }

    /**
     * Get the SHA of a file in the repository.
     * Returns null if the file doesn't exist.
     */
    async getFileSha(path: string): Promise<string | null> {
        const encodedPath = path.split("/").map(encodeURIComponent).join("/");
        const result = await this.request<{ sha: string }>(
            "GET",
            `/contents/${encodedPath}?ref=${encodeURIComponent(this.config.branch)}`
        );

        if (result.status === 404 || !result.data) {
            return null;
        }

        return result.data.sha;
    }

    /**
     * Create or update a file in the repository.
     * Implements idempotency by checking content SHA before upload.
     * 
     * @param path - Path to the file in the repository
     * @param content - File content (string for text, ArrayBuffer for binary)
     * @param message - Commit message
     * @returns Upload result with SHA and whether upload occurred
     */
    async createOrUpdateFile(
        path: string,
        content: string | ArrayBuffer,
        message: string
    ): Promise<UploadResult> {
        // Get existing file SHA (if any)
        const existingSha = await this.getFileSha(path);

        // Compute local content SHA
        const localSha = await computeGitBlobSha(content);

        // If file exists and content is identical, skip upload
        if (existingSha && existingSha === localSha) {
            return {
                uploaded: false,
                sha: existingSha,
                path,
            };
        }

        // Convert content to base64
        let base64Content: string;
        if (typeof content === "string") {
            // For text content, encode to base64
            // Use TextEncoder for proper UTF-8 handling
            const encoder = new TextEncoder();
            const bytes = encoder.encode(content);
            base64Content = arrayBufferToBase64(bytes.buffer);
        } else {
            // For binary content, use Obsidian's helper
            base64Content = arrayBufferToBase64(content);
        }

        // Build request payload
        const payload: {
            message: string;
            content: string;
            branch: string;
            sha?: string;
        } = {
            message,
            content: base64Content,
            branch: this.config.branch,
        };

        // Include SHA if updating existing file
        if (existingSha) {
            payload.sha = existingSha;
        }

        const encodedPath = path.split("/").map(encodeURIComponent).join("/");
        const result = await this.request<{ content: { sha: string } }>(
            "PUT",
            `/contents/${encodedPath}`,
            payload
        );

        if (!result.data) {
            throw new Error(`Failed to upload file: ${path}`);
        }

        return {
            uploaded: true,
            sha: result.data.content.sha,
            path,
        };
    }

    /**
     * Delete a file from the repository.
     * 
     * @param path - Path to the file
     * @param sha - SHA of the file (required for deletion)
     * @param message - Commit message
     */
    async deleteFile(path: string, sha: string, message: string): Promise<void> {
        const encodedPath = path.split("/").map(encodeURIComponent).join("/");
        await this.request(
            "DELETE",
            `/contents/${encodedPath}`,
            {
                message,
                sha,
                branch: this.config.branch,
            }
        );
    }

    /**
     * List contents of a directory in the repository.
     * Returns empty array if directory doesn't exist.
     */
    async listDirectory(path: string): Promise<GitHubFile[]> {
        const encodedPath = path.split("/").map(encodeURIComponent).join("/");
        const result = await this.request<Array<{ name: string; path: string; sha: string; type: string }>>(
            "GET",
            `/contents/${encodedPath}?ref=${encodeURIComponent(this.config.branch)}`
        );

        if (result.status === 404 || !result.data) {
            return [];
        }

        // Handle case where path is a file, not a directory
        if (!Array.isArray(result.data)) {
            return [];
        }

        return result.data.map((item) => ({
            name: item.name,
            path: item.path,
            sha: item.sha,
            type: item.type === "dir" ? "dir" : "file",
        }));
    }

    /**
     * Get file content from the repository.
     * Returns null if file doesn't exist.
     */
    async getFileContent(path: string): Promise<string | null> {
        const encodedPath = path.split("/").map(encodeURIComponent).join("/");
        const result = await this.request<{ content: string; encoding: string }>(
            "GET",
            `/contents/${encodedPath}?ref=${encodeURIComponent(this.config.branch)}`
        );

        if (result.status === 404 || !result.data) {
            return null;
        }

        // GitHub returns base64 encoded content
        if (result.data.encoding === "base64") {
            // Decode base64 to bytes, then UTF-8 decode
            const binaryString = atob(result.data.content.replace(/\n/g, ""));
            const bytes = Uint8Array.from(binaryString, (c) => c.charCodeAt(0));
            const decoder = new TextDecoder("utf-8");
            return decoder.decode(bytes);
        }

        return null;
    }

    /**
     * Check if the client is properly configured
     */
    isConfigured(): boolean {
        return !!(
            this.config.owner &&
            this.config.repo &&
            this.config.token &&
            this.config.branch
        );
    }
}

