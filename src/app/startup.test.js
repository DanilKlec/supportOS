import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { expect, it, vi } from "vitest";

const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const startup = readFileSync(
	new URL("../../public/startup.js", import.meta.url),
	"utf8",
);

it("renders and recovers when the JS bundle never starts, preserving account and draft storage", async () => {
	const dom = new JSDOM(html, {
		url: "https://app.test/qc",
		runScripts: "outside-only",
	});
	const { window } = dom;
	const unregister = vi.fn(async () => true);
	const otherUnregister = vi.fn(async () => true);
	const deleteCache = vi.fn(async () => true);
	Object.defineProperty(window.navigator, "serviceWorker", {
		value: {
			getRegistrations: async () => [
				{ scope: "https://app.test/", unregister },
				{ scope: "https://app.test/other/", unregister: otherUnregister },
			],
		},
	});
	Object.defineProperty(window, "caches", {
		value: {
			keys: async () => [
				"workbox-precache-v2-https://app.test/",
				"workbox-precache-v2-https://app.test/other/",
				"supportos-assets-v1",
				"supportos-drafts",
			],
			delete: deleteCache,
		},
	});
	window.localStorage.setItem("session", "synthetic-session");
	window.localStorage.setItem("draft", "unsaved-text");
	window.eval(startup);
	expect(window.document.querySelector("h1")?.textContent).toBe(
		"Открываем SupportOS",
	);
	window.dispatchEvent(new window.Event("error"));
	const button = window.document.getElementById("startup-retry");
	expect(button.hidden).toBe(false);
	// jsdom cannot navigate, but all recovery side effects before reload are real.
	await window.supportosRecover();
	expect(unregister).toHaveBeenCalledOnce();
	expect(otherUnregister).not.toHaveBeenCalled();
	expect(deleteCache.mock.calls.map(([key]) => key)).toEqual([
		"workbox-precache-v2-https://app.test/",
		"supportos-assets-v1",
	]);
	expect(window.localStorage.getItem("session")).toBe("synthetic-session");
	expect(window.localStorage.getItem("draft")).toBe("unsaved-text");
	dom.window.close();
});
