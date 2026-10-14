import type { ComponentProps } from "react";
import { BonusFreshness } from "../BonusFreshness";

export function BonusFreshnessControls(
	props: ComponentProps<typeof BonusFreshness>,
) {
	return <BonusFreshness {...props} />;
}
