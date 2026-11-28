import { expect, test } from "./fixture";

test.use({ seedAppearance: false, colorScheme: "light" });

test("first visit, custom appearance and reset use the same workspace settings", async ({ page }) => {
	await page.goto("/settings#appearance");
	const root = page.locator("html");
	const graphite = page.getByRole("button", { name: "Графит", exact: true });
	await expect(graphite).toHaveCSS("border-top-color", "rgb(161, 161, 170)");
	await expect(root).toHaveAttribute("data-density", "compact");
	await expect(root).toHaveAttribute("data-theme-mode", "dark");
	await expect(root).toHaveAttribute("data-radius", "rounded");
	await expect(root).toHaveAttribute("data-palette", "slate");
	await expect(root).toHaveCSS("font-size", "14px");

	await page.getByRole("button", { name: "Комфортная", exact: true }).click();
	await page.getByRole("button", { name: /^Стекло/ }).click();
	await page.getByRole("button", { name: "Изумрудный", exact: true }).click();
	await page.reload();
	await expect(root).toHaveAttribute("data-palette", "glass");
	await expect(page.locator(".account-page")).toHaveCSS("background-image", /radial-gradient/);
	await expect(root).toHaveAttribute("data-density", "comfortable");
	await expect(page.getByRole("button", { name: "Изумрудный", exact: true }))
		.toHaveCSS("border-top-color", "rgb(16, 185, 129)");
	await page.getByRole("button", { name: "Сбросить", exact: true }).click();
	await expect(graphite).toHaveCSS("border-top-color", "rgb(161, 161, 170)");
	await expect(root).toHaveAttribute("data-palette", "slate");
	await expect(root).toHaveAttribute("data-density", "compact");
});
