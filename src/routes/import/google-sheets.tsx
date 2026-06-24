import { createFileRoute } from "@tanstack/react-router";

import { GoogleSheetsImportPanel } from "@/components/import/GoogleSheetsImportPanel";

export const Route = createFileRoute("/import/google-sheets")({
	component: GoogleSheetsImportPage,
});

function GoogleSheetsImportPage() {
	return (
		<div className="h-full overflow-auto bg-background">
			<div className="mx-auto flex w-full max-w-6xl flex-col gap-5 p-6">
				<GoogleSheetsImportPanel />
			</div>
		</div>
	);
}
