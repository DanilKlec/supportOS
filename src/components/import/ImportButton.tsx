import { Upload } from "lucide-react";
import { useRef } from "react";

export function ImportButton() {
	const fileInputRef = useRef<HTMLInputElement>(null);

	return (
		<button
			type="button"
			onClick={() => fileInputRef.current?.click()}
			className="flex items-center gap-1.5 rounded-lg bg-surface-elevated px-3 py-1.5 text-sm text-muted transition-colors hover:bg-surface hover:text-foreground"
			title="Import from CSV file"
		>
			<Upload size={16} />
			<span className="hidden sm:inline">Import</span>
		</button>
	);
}
