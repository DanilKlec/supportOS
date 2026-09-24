import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { authenticatedFetch } from "@/services/authenticated-fetch";
import { useAuthStore } from "@/store/auth.store";
export function ShareRecipientPicker({
	value,
	onChange,
	sharedEmails,
	disabled,
}: {
	value: string;
	onChange: (email: string) => void;
	sharedEmails: string[];
	disabled: boolean;
}) {
	const user = useAuthStore((s) => s.session?.user.id);
	const [search, setSearch] = useState(""),
		[query, setQuery] = useState(""),
		[page, setPage] = useState(1);
	useEffect(() => {
		const timer = setTimeout(() => {
			setQuery(search.trim());
			setPage(1);
		}, 250);
		return () => clearTimeout(timer);
	}, [search]);
	const accounts = useQuery({
		queryKey: ["accounts", "share", user, query, page],
		queryFn: async ({ signal }) => {
			const response = await authenticatedFetch(
				`/api/accounts?action=users&purpose=share&page=${page}&search=${encodeURIComponent(query)}`,
				{ signal },
			);
			const data = await response.json();
			if (!response.ok)
				throw new Error(data.error ?? "Не удалось загрузить сотрудников");
			return data as {
				users: { id: string; display_name: string; email: string }[];
				hasMore: boolean;
			};
		},
		staleTime: 30000,
		refetchOnMount: "always",
	});
	const users = accounts.data?.users.filter((account) => account.id !== user);
	return (
		<div className="w-full space-y-2">
			<label className="ui-field text-sm">
				Поиск по имени или email
				<input
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					className="ui-input mt-2 w-full border border-border bg-background"
				/>
			</label>
			{accounts.isFetching && (
				<output className="block">Загрузка сотрудников…</output>
			)}
			{accounts.error && (
				<p role="alert">
					{accounts.error.message}{" "}
					<button type="button" onClick={() => void accounts.refetch()}>
						Повторить
					</button>
				</p>
			)}
			<div className="max-h-64 overflow-auto">
				{users?.map((account) => {
					const shared = sharedEmails.some(
						(email) => email.toLowerCase() === account.email.toLowerCase(),
					);
					return (
						<button
							type="button"
							key={account.id}
							disabled={disabled || shared}
							aria-pressed={value === account.email}
							onClick={() => onChange(account.email)}
							className="block min-h-12 w-full rounded-lg border-b border-border p-3 text-left text-sm aria-pressed:bg-accent/10 disabled:opacity-60"
						>
							<span className="block">
								{account.display_name || account.email}
							</span>
							<span className="text-xs text-muted">
								{shared ? "Уже имеет доступ" : account.email}
							</span>
						</button>
					);
				})}
			</div>
			{users && !users.length && !accounts.isFetching && !accounts.error && (
				<p className="text-sm text-muted">Сотрудники не найдены.</p>
			)}
			<div className="ui-actions items-center flex gap-3">
				<button
					type="button"
					disabled={page === 1 || accounts.isFetching}
					onClick={() => setPage(page - 1)}
				>
					Назад
				</button>
				<span>Страница {page}</span>
				<button
					type="button"
					disabled={!accounts.data?.hasMore || accounts.isFetching}
					onClick={() => setPage(page + 1)}
				>
					Далее
				</button>
			</div>
		</div>
	);
}
