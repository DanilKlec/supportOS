import { useState } from "react";
import { useAuthStore } from "@/store/auth.store";
import { can } from "../../../shared/access.js";
import { SharedBindWorkbench } from "./SharedBindWorkbench";
import { EmployeeBindsWorkbench } from "./EmployeeBindsWorkbench";

export function SharedBindsPage() {
	const user = useAuthStore((s) => s.session?.user);
	const [employees, setEmployees] = useState(false);
	return employees && can(user?.access, "binds.manage") ? (
		<EmployeeBindsWorkbench onCommon={() => setEmployees(false)} />
	) : (
		<SharedBindWorkbench
			onManage={
				can(user?.access, "binds.manage") ? () => setEmployees(true) : undefined
			}
		/>
	);
}
export { SharedBindEditor } from "./SharedBindEditor";
