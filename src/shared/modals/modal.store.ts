import { create } from "zustand";

import type { ActiveModal, ModalPayload, ModalType } from "./modal.types";

interface ModalState {
	activeModal: ActiveModal | null;
	openModal: (type: ModalType, payload?: ModalPayload) => void;
	closeModal: () => void;
}

export const useModalStore = create<ModalState>((set) => ({
	activeModal: null,

	openModal: (type, payload) =>
		set({
			activeModal: { type, payload },
		}),

	closeModal: () =>
		set({
			activeModal: null,
		}),
}));

export const modalManager = {
	open(type: ModalType, payload?: ModalPayload) {
		useModalStore.getState().openModal(type, payload);
	},

	close() {
		useModalStore.getState().closeModal();
	},
};
