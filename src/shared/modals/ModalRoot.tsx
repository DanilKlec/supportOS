import { useModalStore } from "@/shared/modals/modal.store";

import { BindFormModal } from "./BindFormModal";
import { BindHistoryModal } from "./BindHistoryModal";
import { CopyBindModal } from "./CopyBindModal";
import { FindDuplicatesModal } from "./FindDuplicatesModal";
import {
	CreateCategoryModal,
	CreateFolderModal,
	DeleteModal,
	MoveBindModal,
	RenameModal,
} from "./KnowledgeModals";
import type { ActiveModal } from "./modal.types";

export function ModalRoot() {
	const activeModal = useModalStore((state) => state.activeModal);
	const closeModal = useModalStore((state) => state.closeModal);

	if (!activeModal) return null;

	const key = [
		activeModal.type,
		activeModal.payload?.bindId,
		activeModal.payload?.id,
		activeModal.payload?.categoryId,
		activeModal.payload?.folderId,
		activeModal.payload?.parentId,
		activeModal.payload?.language,
	]
		.filter(Boolean)
		.join(":");

	return (
		<ModalContent
			key={key || activeModal.type}
			activeModal={activeModal}
			onClose={closeModal}
		/>
	);
}

function ModalContent({
	activeModal,
	onClose,
}: {
	activeModal: ActiveModal;
	onClose: () => void;
}) {
	const payload = activeModal.payload ?? {};

	if (activeModal.type === "createCategory") {
		return <CreateCategoryModal onClose={onClose} />;
	}

	if (activeModal.type === "createFolder") {
		return <CreateFolderModal payload={payload} onClose={onClose} />;
	}

	if (activeModal.type === "renameNode") {
		return <RenameModal payload={payload} onClose={onClose} />;
	}

	if (activeModal.type === "deleteNode") {
		return <DeleteModal payload={payload} onClose={onClose} />;
	}

	if (activeModal.type === "moveBind") {
		return <MoveBindModal payload={payload} onClose={onClose} />;
	}

	if (activeModal.type === "copyBind") {
		return <CopyBindModal payload={payload} onClose={onClose} />;
	}

	if (activeModal.type === "bindHistory") {
		return <BindHistoryModal payload={payload} onClose={onClose} />;
	}

	if (activeModal.type === "findDuplicates") {
		return <FindDuplicatesModal payload={payload} onClose={onClose} />;
	}

	if (activeModal.type === "createBind") {
		return <BindFormModal mode="create" payload={payload} onClose={onClose} />;
	}

	return <BindFormModal mode="edit" payload={payload} onClose={onClose} />;
}
