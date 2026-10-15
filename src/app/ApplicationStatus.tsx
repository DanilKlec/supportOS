import { Component, type ReactNode, useEffect, useState } from "react";
import { SupportOSLogo } from "@/components/brand/SupportOSLogo";
import { Button } from "@/components/ui/Button";

declare global {
	interface Window {
		supportosRecover?: () => Promise<void>;
	}
}

export function recoverApplication() {
	if (window.supportosRecover) return window.supportosRecover();
	window.location.reload();
}

export function ApplicationStatus({ failed = false }: { failed?: boolean }) {
	const [slow, setSlow] = useState(false);
	useEffect(() => {
		const timer = window.setTimeout(() => setSlow(true), 12000);
		return () => window.clearTimeout(timer);
	}, []);
	return (
		<main className="flex min-h-dvh items-center justify-center bg-background p-6 text-foreground">
			<section
				className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 text-center"
				aria-label="Состояние приложения"
			>
				<SupportOSLogo className="mx-auto mb-5 h-10 w-10" />
				<h1 className="text-lg font-semibold">
					{failed ? "Не удалось открыть страницу" : "Открываем SupportOS"}
				</h1>
				<p
					role={failed ? "alert" : "status"}
					className="mt-3 text-sm leading-6 text-muted"
				>
					{failed
						? "Соединение прервалось или версия приложения обновилась. Загрузите страницу ещё раз."
						: slow
							? "Загрузка занимает больше времени. Проверьте соединение или повторите попытку."
							: "Загружаем рабочее пространство и проверяем доступ…"}
				</p>
				{(failed || slow) && (
					<Button
						className="mt-5"
						variant="primary"
						onClick={() => void recoverApplication()}
					>
						Загрузить заново
					</Button>
				)}
			</section>
		</main>
	);
}

export function ApplicationError() {
	return <ApplicationStatus failed />;
}

export class ApplicationBoundary extends Component<
	{ children: ReactNode },
	{ failed: boolean }
> {
	state = { failed: false };
	static getDerivedStateFromError() {
		return { failed: true };
	}
	render() {
		return this.state.failed ? <ApplicationError /> : this.props.children;
	}
}
