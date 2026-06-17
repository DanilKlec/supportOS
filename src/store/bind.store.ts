import { create } from "zustand";
import type { Bind } from "@/entities/bind";

interface BindState {
  binds: Bind[];

  add: (bind: Bind) => void;

  update: (bind: Bind) => void;

  remove: (id: string) => void;
}

export const useBindStore = create<BindState>((set) => ({
  binds: [],

  add: (bind) =>
    set((state) => ({
      binds: [...state.binds, bind],
    })),

  update: (bind) =>
    set((state) => ({
      binds: state.binds.map((b) =>
        b.id === bind.id ? bind : b
      ),
    })),

  remove: (id) =>
    set((state) => ({
      binds: state.binds.filter((b) => b.id !== id),
    })),
}));