import { build, preview } from "vite";

// Render the real production bundle, but NEVER load .env or connect its APIs.
// configureServer hooks (including backend/auth handlers) do not run in preview.
const config = {
	configFile: "vite.config.ts",
	mode: "visual",
	envDir: false,
	logLevel: "warn",
	define: {
		"import.meta.env.VITE_SUPABASE_URL": JSON.stringify(
			"https://supportos-visual.invalid",
		),
		"import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(
			"visual-fixture-public-key-not-a-credential",
		),
		"import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify(
			"visual-fixture-public-key-not-a-credential",
		),
	},
	build: { outDir: "test-results/visual-app" },
	preview: { host: "127.0.0.1", port: 4173, strictPort: true },
	plugins: [
		{
			name: "visual-preview-no-backend",
			configurePreviewServer(server) {
				server.middlewares.use((request, response, next) => {
					if (
						!new URL(request.url, "http://127.0.0.1").pathname.startsWith(
							"/api/",
						)
					)
						return next();
					response.writeHead(403, { "Content-Type": "application/json" });
					response.end(
						JSON.stringify({ error: "Visual preview has no backend" }),
					);
				});
			},
		},
	],
};

await build(config);
const server = await preview(config);
for (const signal of ["SIGINT", "SIGTERM"]) {
	process.once(signal, () => server.httpServer.close(() => process.exit(0)));
}
