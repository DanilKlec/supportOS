import { Download } from "lucide-react";
import { useToast } from "#/shared/hooks/useToast";

export function ExportButton() {
	const { showToast } = useToast();

	const exportToCSV = () => {
		// Download CSV

		const link = document.createElement("a");
		link.download = `supportos-binds-${new Date().toISOString().split("T")[0]}.csv`;
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
	};

	const exportToGoogleSheets = () => {
		try {
			// Get Google Sheets URL from environment or use a public script
			const spreadsheetId = "1AhBX-mv0miFxumbAJODeR4_8PcmUbN5mSMfD4pz5HwY";

			// For now, open the Google Sheet in a new tab
			const sheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit?usp=sharing`;
			window.open(sheetUrl, "_blank");

			showToast("Opening Google Sheet... Please paste your data there.");
			// Auto-copy CSV data to clipboard
			exportToCSV();
		} catch {
			showToast("Failed to open Google Sheet");
		}
	};

	return (
		<div className="flex gap-2">
			<button
				type="button"
				onClick={exportToCSV}
				className="flex items-center gap-1.5 rounded-lg bg-surface-elevated px-3 py-1.5 text-sm text-muted hover:text-foreground hover:bg-surface transition-colors"
				title="Export as CSV"
			>
				<Download size={16} />
				<span className="hidden sm:inline">CSV</span>
			</button>
			<button
				type="button"
				onClick={exportToGoogleSheets}
				className="flex items-center gap-1.5 rounded-lg bg-surface-elevated px-3 py-1.5 text-sm text-muted hover:text-foreground hover:bg-surface transition-colors"
				title="Export to Google Sheets"
			>
				<Download size={16} />
				<span className="hidden sm:inline">Sheets</span>
			</button>
		</div>
	);
}
