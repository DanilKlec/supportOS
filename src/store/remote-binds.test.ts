import { expect, it } from "vitest";
import { useKnowledgeStore } from "./knowledge.store";

it("never opens an archived local bind through a stale remote copy and removes its tabs", () => {
	const previous = useKnowledgeStore.getState();
	const bind = {
		id: "own",
		slug: "own",
		ownerId: "actor",
		categoryId: "cat",
		tags: [],
		translations: [],
		favorite: false,
		archived: false,
		createdAt: "",
		updatedAt: "",
	};
	try {
		useKnowledgeStore.setState({
			binds: [bind],
			remoteBinds: [bind],
			openedTabs: [bind.id],
			activeTab: bind.id,
		});
		useKnowledgeStore.getState().setBinds([{ ...bind, archived: true }]);
		expect(useKnowledgeStore.getState().openedTabs).toEqual([]);
		expect(useKnowledgeStore.getState().getBind(bind.id)).toBeUndefined();
		useKnowledgeStore.getState().openBind(bind.id);
		expect(useKnowledgeStore.getState().activeTab).toBeUndefined();
	} finally {
		useKnowledgeStore.setState(previous);
	}
});

it("opens, switches and pins remote binds without adding them to the editable local snapshot", () => {
	const previous = useKnowledgeStore.getState();
	const remote = {
		id: "remote",
		slug: "remote",
		translations: [],
		tags: [],
		categoryId: "shared",
		favorite: false,
		archived: false,
		createdAt: "",
		updatedAt: "",
	};
	try {
		useKnowledgeStore.setState({
			binds: [],
			remoteBinds: [remote],
			openedTabs: [],
			pinnedTabs: [],
			activeTab: undefined,
		});
		const store = useKnowledgeStore.getState();
		store.openBind("remote");
		expect(useKnowledgeStore.getState().activeTab).toBe("remote");
		expect(useKnowledgeStore.getState().binds).toEqual([]);
		store.setKnowledge({ search: "query" });
		expect(useKnowledgeStore.getState().openedTabs).toEqual(["remote"]);
		store.togglePinnedTab("remote");
		store.closeTab("remote");
		expect(useKnowledgeStore.getState().openedTabs).toEqual(["remote"]);
		store.togglePinnedTab("remote");
		store.closeTab("remote");
		expect(useKnowledgeStore.getState().openedTabs).toEqual([]);
	} finally {
		useKnowledgeStore.setState(previous);
	}
});
