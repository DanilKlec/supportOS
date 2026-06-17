import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
	resolve: {
		tsconfigPaths: true,
	},

	plugins: [
		tanstackRouter({
			target: "react",
			autoCodeSplitting: true,
		}),

		tailwindcss(),

		VitePWA({
			registerType: "autoUpdate",
			injectRegister: "auto",
			includeAssets: ["favicon.ico", "icon.svg", "logo192.png", "logo512.png"],
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
