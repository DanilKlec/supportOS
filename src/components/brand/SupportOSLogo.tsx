interface SupportOSLogoProps {
	className?: string;
	title?: string;
}

export function SupportOSLogo({
	className = "h-8 w-8",
	title = "SupportOS",
}: SupportOSLogoProps) {
	return (
		<svg
			viewBox="0 0 48 48"
			role="img"
			aria-label={title}
			className={className}
			fill="none"
		>
			<rect width="48" height="48" rx="12" fill="var(--color-accent)" />
			<path
				d="M14 15.5C14 13.6 15.6 12 17.5 12h13c1.9 0 3.5 1.6 3.5 3.5v17c0 1.9-1.6 3.5-3.5 3.5h-13c-1.9 0-3.5-1.6-3.5-3.5v-17Z"
				fill="white"
				fillOpacity="0.96"
			/>
			<path
				d="M18 19h12M18 24h8M18 29h12"
				stroke="var(--color-accent)"
				strokeLinecap="round"
				strokeWidth="2.6"
			/>
			<circle cx="34" cy="14" r="5" fill="var(--color-surface)" />
			<circle cx="34" cy="14" r="2.2" fill="var(--color-accent)" />
		</svg>
	);
}
