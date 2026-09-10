import { useNavigate } from "@tanstack/react-router";
import {
	ArrowUpRight,
	BookOpen,
	Clock3,
	Mail,
	Gift,
	Search,
	Users,
} from "lucide-react";
import { useKnowledgeStore } from "@/store";
import { useAuthStore } from "@/store/auth.store";
import { can, routePermission } from "../../../shared/access.js";

const shortcuts = [
	{
		to: "/shared-binds",
		title: "Ответы команды",
		description: "Общие бинды и ваши личные версии",
		icon: Users,
	},
	{
		to: "/project-emails",
		title: "Почты проектов",
		description: "Контакты и информация по сайтам",
		icon: Mail,
	},
	{
		to: "/bonuses",
		title: "Бонусы и условия",
		description: "Правила и предложения для клиентов",
		icon: Gift,
	},
] as const;
export function EmptyWorkspace() {
	const navigate = useNavigate();
	const user = useAuthStore((s) => s.session?.user);
	const binds = useKnowledgeStore((s) => s.binds);
	const recent = useKnowledgeStore((s) => s.recent);
	const language = useKnowledgeStore((s) => s.language);
	const openBind = useKnowledgeStore((s) => s.openBind);
	const setSearch = useKnowledgeStore((s) => s.setSearch);
	const latest = recent
		.map((id) => binds.find((b) => b.id === id && !b.archived))
		.filter((b) => b !== undefined)
		.slice(0, 5);
	const search = () => {
		setSearch("");
		window.dispatchEvent(
			new KeyboardEvent("keydown", { code: "KeyK", ctrlKey: true }),
		);
	};
	return (
		<div className="supportos-scroll min-h-0 flex-1 overflow-y-auto px-5 py-8 sm:px-8 lg:px-12 lg:py-12">
			<div className="mx-auto w-full max-w-5xl">
				<div className="mb-8 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[.16em] text-muted">
					<span className="h-1.5 w-1.5 rounded-full bg-accent" />
					Рабочее пространство
				</div>
				<h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
					{user?.access?.display_name
						? `${user.access.display_name}, всё под рукой`
						: "Хорошая поддержка начинается здесь"}
				</h1>
				<p className="mt-3 max-w-xl text-sm leading-7 text-muted">
					Найдите готовый ответ, уточните условия или продолжите работу с
					недавним материалом.
				</p>
				<button
					type="button"
					onClick={search}
					className="mt-7 flex min-h-14 w-full max-w-2xl items-center gap-3 rounded-2xl border border-border bg-surface px-5 text-left shadow-sm transition hover:border-accent/40"
				>
					<Search size={19} className="text-accent" />
					<span className="flex-1 text-sm text-muted">Какой ответ ищем?</span>
					<kbd className="hidden rounded-md border border-border px-2 py-1 text-[10px] text-muted sm:block">
						Ctrl / ⌘ K
					</kbd>
				</button>
				<div className="mt-9 grid gap-3 xl:grid-cols-3 sm:grid-cols-2">
					{shortcuts
						.filter((item) => can(user?.access, routePermission(item.to)))
						.map(({ to, title, description, icon: Icon }) => (
							<button
								type="button"
								key={to}
								onClick={() => void navigate({ to })}
								className="group rounded-2xl border border-border bg-surface/70 p-5 text-left transition hover:-translate-y-0.5 hover:border-accent/35 hover:bg-surface"
							>
								<div className="mb-6 flex items-center justify-between">
									<span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-accent">
										<Icon size={20} strokeWidth={1.6} />
									</span>
									<ArrowUpRight
										size={17}
										className="text-muted transition group-hover:text-accent"
									/>
								</div>
								<h2 className="text-sm font-semibold">{title}</h2>
								<p className="mt-2 text-xs leading-5 text-muted">
									{description}
								</p>
							</button>
						))}
				</div>
				<section className="mt-9">
					<div className="mb-4 flex items-center gap-2">
						<Clock3 size={16} className="text-muted" />
						<h2 className="text-sm font-semibold">Продолжить работу</h2>
					</div>
					{latest.length ? (
						<div className="overflow-hidden rounded-2xl border border-border bg-surface/50">
							{latest.map((bind) => (
								<button
									type="button"
									key={bind.id}
									onClick={() => openBind(bind.id)}
									className="flex min-h-16 w-full items-center gap-3 border-b border-border/60 px-5 text-left last:border-0 hover:bg-surface-elevated"
								>
									<BookOpen size={17} className="shrink-0 text-muted" />
									<span className="min-w-0 flex-1 truncate text-sm">
										{bind.translations.find((t) => t.language === language)
											?.title ??
											bind.translations[0]?.title ??
											bind.slug}
									</span>
									<ArrowUpRight size={15} className="text-muted" />
								</button>
							))}
						</div>
					) : (
						<div className="rounded-2xl border border-dashed border-border p-6 text-sm leading-6 text-muted">
							Здесь появятся недавно открытые ответы. Выберите материал в папках
							слева или воспользуйтесь поиском.
						</div>
					)}
				</section>
			</div>
		</div>
	);
}
