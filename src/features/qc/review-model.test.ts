import { expect, it } from "vitest";
import { reviewItems } from "./review-model";

it("aggregates outdated evidence without inventing confidence, risk or candidates", () => {
	const rows = reviewItems(
		[],
		{
			feedback: [
				{ bind_id: "b", kind: "outdated", updated_at: "2026-01-01" },
				{ bind_id: "b", kind: "outdated", updated_at: "2026-01-02" },
				{ bind_id: "c", kind: "helpful", updated_at: "2026-01-03" },
			],
			gaps: [
				{
					id: 1,
					topic: "Payment review",
					project_id: "p",
					created_at: "2026-01-03",
				},
			],
		},
		[],
	);
	expect(rows).toHaveLength(2);
	expect(rows[0]).toMatchObject({
		materialId: "b",
		kind: "outdated",
		createdAt: "2026-01-02",
	});
	expect(rows[0].evidence[0]).toContain("2");
	expect(rows[0].risk).toBeUndefined();
	expect(rows[0].confidence).toBeUndefined();
	expect(rows[1].projectId).toBe("p");
});
