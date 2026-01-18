import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		globals: true,
		environment: "node",
		include: ["src/**/*.test.ts"],
		coverage: {
			reporter: ["text", "json", "html"],
			include: ["src/**/*.ts"],
			exclude: ["src/**/*.test.ts", "src/main.ts"],
		},
		// Mock obsidian module which is only available in Obsidian runtime
		alias: {
			obsidian: new URL("./test/mocks/obsidian.ts", import.meta.url).pathname,
		},
	},
});
