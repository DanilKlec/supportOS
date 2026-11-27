import { expect, it } from "vitest";
import { safeAuthRedirect } from "./auth-redirect";

it("preserves an internal deep link", () => {
	expect(safeAuthRedirect("/bonuses?project=demo#calculator")).toBe(
		"/bonuses?project=demo#calculator",
	);
});
it("does not forward the Gmail return code or state to the login URL", () => {
	expect(
		safeAuthRedirect("/admin#mailboxes?mail_code=test&mail_state=sample"),
	).toBe("/admin#mailboxes");
});
it.each([
	"https://evil.test",
	"//evil.test",
	"/\\evil.test",
	"/login",
	"/login/?redirect=/login",
	null,
	"/\nevil",
])("rejects unsafe or looping return path %s", (value) => {
	expect(safeAuthRedirect(value)).toBe("/");
});
