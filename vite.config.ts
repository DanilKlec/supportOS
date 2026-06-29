import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { defineConfig, type Plugin } from "vite";
import { VitePWA } from "vite-plugin-pwa";

import { loadSportsBettingLive } from "./api/sports-betting/_live.js";

const GOOGLE_SHEETS_PROXY_PATH = "/api/google-sheets/fetch";
const SPORTS_BETTING_LIVE_PATH = "/api/sports-betting/live";
const ALLOWED_GOOGLE_HOSTS = new Set([
	"docs.google.com",
	"spreadsheets.google.com",
]);

function sendProxyText(
	response: {
		statusCode: number;
		setHeader: (name: string, value: string) => void;
		end: (value?: string | Uint8Array) => void;
	},
	status: number,
	body: string | Uint8Array,
	contentType = "text/plain; charset=utf-8",
) {
	response.statusCode = status;
	response.setHeader("Access-Control-Allow-Origin", "*");
	response.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
	response.setHeader("Access-Control-Allow-Headers", "Content-Type");
	response.setHeader("Cache-Control", "no-store");
	response.setHeader("Content-Type", contentType);
	response.end(body);
}

function googleSheetsProxyPlugin(): Plugin {
	return {
		name: "supportos-google-sheets-proxy",
		configureServer(server) {
			server.middlewares.use(async (request, response, next) => {
				const requestUrl = request.url ?? "";

				if (!requestUrl.startsWith(GOOGLE_SHEETS_PROXY_PATH)) {
					next();
					return;
				}

				if (request.method === "OPTIONS") {
					sendProxyText(response, 204, "");
					return;
				}

				if (request.method !== "GET") {
					sendProxyText(response, 405, "Method not allowed");
					return;
				}

				try {
					const parsed = new URL(requestUrl, "http://localhost");
					const rawTargetUrl = parsed.searchParams.get("url");

					if (!rawTargetUrl) {
						sendProxyText(response, 400, "Google Sheets URL is required");
						return;
					}

					const target = new URL(rawTargetUrl);

					if (
						target.protocol !== "https:" ||
						!ALLOWED_GOOGLE_HOSTS.has(target.hostname)
					) {
						sendProxyText(
							response,
							400,
							"Only Google Sheets HTTPS URLs are supported",
						);
						return;
					}

					const googleResponse = await fetch(target.toString(), {
						redirect: "follow",
						headers: {
							"User-Agent": "SupportOS Google Sheets Import",
						},
					});
					const bytes = new Uint8Array(await googleResponse.arrayBuffer());

					sendProxyText(
						response,
						googleResponse.status,
						bytes,
						googleResponse.headers.get("content-type") ??
							"application/octet-stream",
					);
				} catch (error) {
					sendProxyText(
						response,
						502,
						error instanceof Error
							? error.message
							: "Unable to load Google Sheet",
					);
				}
			});
		},
	};
}

function sportsBettingLivePlugin(): Plugin {
	return {
		name: "supportos-sports-betting-live",
		configureServer(server) {
			server.middlewares.use(async (request, response, next) => {
				const requestUrl = request.url ?? "";

				if (!requestUrl.startsWith(SPORTS_BETTING_LIVE_PATH)) {
					next();
					return;
				}

				if (request.method === "OPTIONS") {
					sendProxyText(response, 204, "");
					return;
				}

				if (request.method !== "GET") {
					sendProxyText(response, 405, "Method not allowed");
					return;
				}

				try {
					const parsed = new URL(requestUrl, "http://localhost");
					const query = Object.fromEntries(parsed.searchParams.entries());
					const data = await loadSportsBettingLive({
						query,
						env: process.env,
					});

					sendProxyText(
						response,
						200,
						JSON.stringify(data),
						"application/json; charset=utf-8",
					);
				} catch (error) {
					const body = JSON.stringify({
						error:
							error instanceof Error
								? error.message
								: "Unable to load sports betting data",
						details:
							typeof error === "object" && error && "details" in error
								? error.details
								: undefined,
					});
					const status =
						typeof error === "object" &&
						error &&
						"status" in error &&
						typeof error.status === "number"
							? error.status
							: 502;

					sendProxyText(
						response,
						status,
						body,
						"application/json; charset=utf-8",
					);
				}
			});
		},
	};
}

export default defineConfig({
	resolve: {
		tsconfigPaths: true,
	},

	plugins: [
		tanstackRouter({
			target: "react",
			autoCodeSplitting: true,
		}),

		googleSheetsProxyPlugin(),

		sportsBettingLivePlugin(),

		tailwindcss(),

		VitePWA({
			registerType: "autoUpdate",
			injectRegister: "auto",
			includeAssets: ["icon.svg"],
			manifest: false,
			workbox: {
				cleanupOutdatedCaches: true,
				navigateFallback: "/index.html",
				globPatterns: ["**/*.{js,css,html,ico,png,svg,json,webmanifest}"],
			},
			devOptions: {
				enabled: false,
			},
		}),
	],

	server: {
		port: 3000,
	},
});
