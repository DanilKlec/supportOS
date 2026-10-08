import { config, db } from "../agent-monitor/_server.js";

export async function readPublishedGlossary() {
	return db(
		config(),
		"supportos_glossary_terms?select=id,source,target,language,project_id,note,priority,enabled&active=eq.true&enabled=eq.true&order=priority.desc,id.asc&limit=1000",
	);
}
