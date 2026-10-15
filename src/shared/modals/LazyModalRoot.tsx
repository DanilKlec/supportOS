import { lazy, Suspense } from "react";
import { BaseModal } from "./BaseModal";
import { useModalStore } from "./modal.store";

const ModalRoot = lazy(() =>
	import("./ModalRoot").then((module) => ({ default: module.ModalRoot })),
);

export function LazyModalRoot() {
	const active = useModalStore((state) => state.activeModal);
	const close = useModalStore((state) => state.closeModal);
	if (!active) return null;
	return (
		<Suspense
			fallback={
				<BaseModal title="Открываем окно…" onClose={close}>
					<output className="text-sm text-muted">Загрузка…</output>
				</BaseModal>
			}
		>
			<ModalRoot />
		</Suspense>
	);
}
