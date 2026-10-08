import { defineConfig } from "@playwright/test";

export default defineConfig({
	testDir: "./tests/visual",
	// Keep Playwright tests out of Vitest's *.test / *.spec discovery.
	testMatch: "**/*.visual.ts",
	fullyParallel: true,
	forbidOnly: Boolean(process.env.CI),
	workers: 2,
	retries: 0,
	timeout: 30_000,
	updateSnapshots: "none",
	snapshotPathTemplate:
		"{testDir}/__screenshots__/{projectName}/{platform}/{arg}{ext}",
	outputDir: "test-results/visual",
	reporter: [["list"], ["html", { open: "never" }]],
	expect: {
		timeout: 10_000,
		toHaveScreenshot: {
			animations: "disabled",
			caret: "hide",
			// Small anti-aliasing tolerance; no broad percentage allowance.
			maxDiffPixels: 80,
			threshold: 0.1,
		},
	},
	use: {
		baseURL: "http://127.0.0.1:4173",
		browserName: "chromium",
		locale: "ru-RU",
		timezoneId: "UTC",
		colorScheme: "dark",
		reducedMotion: "reduce",
		deviceScaleFactor: 1,
		serviceWorkers: "block",
		trace: "retain-on-failure",
		screenshot: "only-on-failure",
	},
	projects: [
		{ name: "desktop", use: { viewport: { width: 1440, height: 900 } } },
		{
			name: "mobile",
			use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
		},
	],
	webServer: {
		command: "node tests/visual/server.mjs",
		url: "http://127.0.0.1:4173",
		reuseExistingServer: false,
		timeout: 120_000,
	},
});
