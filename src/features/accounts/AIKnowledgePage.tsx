import { useState } from "react";
import {
	AIControlCenter,
	type AISection,
} from "@/features/admin/AIControlCenter";
export function AIKnowledgePage() {
	const [section, setSection] = useState<AISection>("knowledge");
	return (
		<div className="p-5">
			<AIControlCenter section={section} onSection={setSection} />
		</div>
	);
}
