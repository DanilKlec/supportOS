import { useInfiniteQuery } from "@tanstack/react-query";
import { ArrowRight, Search, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, EmptyState, ErrorState, LoadingState } from "@/components/ui";
import {
	type BindEmployee,
	sharedBindsService,
} from "@/services/shared-binds.service";
import { useAuthStore } from "@/store/auth.store";
import { employeeInitials, employeeName } from "./employee-library";

export function EmployeePicker({
	onSelect,
	selectedId,
}: {
	onSelect: (employee: BindEmployee) => void;
	selectedId?: string;
}) {
	const actor = useAuthStore((s) => s.session?.user.id);
	const [search, setSearch] = useState(""),
		[debounced, setDebounced] = useState("");
	useEffect(() => {
		const timer = setTimeout(() => setDebounced(search), 250);
		return () => clearTimeout(timer);
	}, [search]);
	const query = useInfiniteQuery({
		queryKey: ["bind-employee-picker", actor, debounced],
		initialPageParam: 1,
		queryFn: ({ pageParam }) => sharedBindsService.users(debounced, pageParam),
		getNextPageParam: (last, pages) =>
			last.users.length > 0 && pages.length * 50 < last.total
				? pages.length + 1
				: undefined,
	});
	const employees = [
		...new Map(
			query.data?.pages.flatMap((p) => p.users).map((u) => [u.id, u]) ?? [],
		).values(),
	];
	return (
		<section className="employee-picker" aria-label="Выбор сотрудника">
			<div className="employee-picker-heading">
				<div>
					<Users size={20} />
					<div>
						<h2>Выберите сотрудника</h2>
						<p>Откройте его папки, готовые ответы и личные версии.</p>
					</div>
				</div>
				<small>{query.data?.pages[0]?.total ?? ""}</small>
			</div>
			<div className="library-search employee-search">
				<Search size={15} />
				<input
					aria-label="Поиск сотрудника"
					placeholder="Имя или корпоративная почта…"
					value={search}
					onChange={(e) => setSearch(e.target.value)}
				/>
				{search && (
					<button
						type="button"
						aria-label="Очистить поиск сотрудников"
						onClick={() => setSearch("")}
					>
						×
					</button>
				)}
			</div>
			{query.error && (
				<ErrorState
					title="Не удалось загрузить сотрудников."
					onRetry={() => void query.refetch()}
					retrying={query.isFetching}
				/>
			)}
			{query.isPending ? (
				<LoadingState message="Загружаем сотрудников…" />
			) : (
				<div className="employee-picker-grid">
					{employees.map((employee) => (
						<button
							type="button"
							key={employee.id}
							className="employee-card"
							aria-label={`Открыть бинды: ${employeeName(employee)}`}
							aria-pressed={selectedId === employee.id}
							onClick={() => onSelect(employee)}
						>
							<span className="employee-avatar">
								{employeeInitials(employee)}
							</span>
							<span className="employee-card-label">
								<strong>{employeeName(employee)}</strong>
								<small>{employee.email}</small>
							</span>
							<ArrowRight size={15} />
						</button>
					))}
				</div>
			)}
			{!query.isPending && !query.error && employees.length === 0 && (
				<EmptyState
					title="Сотрудники не найдены"
					description="Попробуйте другое имя или почту."
				/>
			)}
			{query.hasNextPage && (
				<Button
					variant="secondary"
					loading={query.isFetchingNextPage}
					onClick={() => void query.fetchNextPage()}
				>
					Показать ещё сотрудников
				</Button>
			)}
		</section>
	);
}
