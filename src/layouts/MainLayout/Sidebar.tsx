import { Link } from "@tanstack/react-router";
import { BookOpen, Clock3, Settings, Star } from "lucide-react";

const menu = [
	{
		icon: BookOpen,
		title: "Knowledge",
		href: "/binds",
	},
	{
		icon: Star,
		title: "Favorites",
		href: "/favorites",
	},
	{
		icon: Clock3,
		title: "Recent",
		href: "/recent",
	},
	{
		icon: Settings,
		title: "Settings",
		href: "/settings",
	},
];

export function Sidebar() {
	return (
		<aside className="flex h-full w-72 flex-col border-r border-border bg-surface">
			{/* Header */}

			<div className="border-b border-border px-5 py-5">
				<h1 className="text-lg font-bold tracking-tight">SupportOS</h1>

				<p className="mt-1 text-xs text-muted">Knowledge Base</p>
			</div>

			{/* Main Navigation */}

			<nav className="px-3 py-4">
				<div className="space-y-1">
					{menu.map((item) => {
						const Icon = item.icon;

						return (
							<Link
								key={item.href}
								to={item.href}
								className="
                  flex
                  items-center
                  gap-3
                  rounded-xl
                  px-3
                  py-2.5
                  text-sm
                  text-muted
                  transition-all
                  hover:bg-accent/10
                  hover:text-accent
                "
							>
								<Icon size={18} />

								<span className="flex-1">{item.title}</span>
							</Link>
						);
					})}
				</div>
			</nav>

			<div className="mx-4 border-b border-border" />

			{/* Categories */}

			<div className="flex-1 overflow-auto px-3 py-4">
				<div className="mb-3 px-2 text-xs font-semibold uppercase tracking-wider text-muted">
					Categories
				</div>
			</div>

			{/* Footer */}

			<div className="border-t border-border px-4 py-3">
				<div className="text-xs text-muted">SupportOS v0.1</div>
			</div>
		</aside>
	);
}
