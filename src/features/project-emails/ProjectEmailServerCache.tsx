import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { contentApi } from "@/services/shared-content.service";
import { useAuthStore } from "@/store/auth.store";
import {
	clearLegacyProjectEmailRecords,
	useProjectEmailStore,
} from "@/store/project-email.store";
import { can } from "../../../shared/access.js";

/**
 * Keeps the legacy Zustand consumer contract while making the API query the
 * source of records. The cache is populated once per signed-in user so a
 * background refetch cannot overwrite an editor's unsaved in-memory draft.
 */
export function ProjectEmailServerCache() {
	const user = useAuthStore((state) => state.session?.user);
	const setRecords = useProjectEmailStore((state) => state.setRecords);
	const appliedForUser = useRef<string | undefined>(undefined);
	const previousUserId = useRef<string | undefined>(undefined);
	const canRead = can(user?.access, "projects.read");
	const query = useQuery({
		queryKey: ["shared-publication", user?.id, "emails", "shared"],
		queryFn: () => contentApi("emails"),
		enabled: Boolean(user?.id) && canRead,
		refetchInterval: 30000,
		refetchOnWindowFocus: true,
		retry: false,
	});

	useEffect(() => {
		if (previousUserId.current === user?.id) return;

		previousUserId.current = user?.id;
		appliedForUser.current = undefined;
		setRecords([]);
	}, [setRecords, user?.id]);

	useEffect(() => {
		if (!user?.id || !query.isSuccess || appliedForUser.current === user.id)
			return;

		setRecords(query.data?.data ?? []);
		if (query.data) clearLegacyProjectEmailRecords();
		appliedForUser.current = user.id;
	}, [query.data, query.isSuccess, setRecords, user?.id]);

	return null;
}
