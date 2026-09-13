// @vitest-environment jsdom
import {
	act,
	cleanup,
	fireEvent,
	render,
	renderHook,
	screen,
} from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { clearSessionViews, useViewState } from "@/shared/hooks/useViewState";
import { BaseModal } from "@/shared/modals/BaseModal";
import { useAuthStore } from "@/store/auth.store";
import { readPreference, writePreference } from "./preferences";

const login = (id: string) =>
	act(() =>
		useAuthStore.getState().setSession({
			accessToken: "test",
			user: { id, email: "test@example.com", role: "support" },
		}),
	);
afterEach(() => {
	cleanup();
	act(() => useAuthStore.getState().setSession(undefined));
	clearSessionViews();
	sessionStorage.clear();
});
it("retains a draft across component remounts, but clears it at logout and isolates accounts", () => {
	login("alice");
	const first = renderHook(() => useViewState("composer-test", "input", ""));
	act(() => first.result.current[1]("private customer text"));
	first.unmount();
	const restored = renderHook(() => useViewState("composer-test", "input", ""));
	expect(restored.result.current[0]).toBe("private customer text");
	login("bob");
	expect(restored.result.current[0]).toBe("");
	expect(Object.values(sessionStorage).join("")).not.toContain(
		"private customer text",
	);
	login("alice");
	expect(restored.result.current[0]).toBe("");
});
it("keeps preferences across logout without sharing them with another account", () => {
	writePreference("alice", "test-width", 420);
	writePreference("bob", "test-width", 320);
	login("alice");
	act(() => useAuthStore.getState().setSession(undefined));
	expect(readPreference("alice", "test-width", 0)).toBe(420);
	expect(readPreference("bob", "test-width", 0)).toBe(320);
});
it("ignores a late draft update from the previous account", () => {
	login("alice");
	const hook = renderHook(() => useViewState("composer-test", "output", ""));
	const staleSetter = hook.result.current[1];
	login("bob");
	act(() => staleSetter("late response"));
	expect(hook.result.current[0]).toBe("");
	expect(Object.values(sessionStorage).join("")).not.toContain("late response");
});
it("Escape belongs to the top dialog and focus returns when it is closed", () => {
	const calls: string[] = [];
	const opener = document.createElement("button");
	document.body.append(opener);
	opener.focus();
	const base = render(
		<BaseModal title="First" onClose={() => calls.push("first")}>
			<button type="button">First action</button>
		</BaseModal>,
	);
	const first = screen.getByRole("dialog");
	expect(document.activeElement).toBe(first);
	const top = render(
		<BaseModal title="Second" onClose={() => calls.push("second")}>
			Second content
		</BaseModal>,
	);
	fireEvent.keyDown(window, { key: "Escape" });
	expect(calls).toEqual(["second"]);
	top.unmount();
	expect(document.activeElement).toBe(first);
	base.unmount();
	expect(document.activeElement).toBe(opener);
	opener.remove();
});
