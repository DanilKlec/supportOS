import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { contentApi } from "@/services/shared-content.service";
import { useAuthStore } from "@/store/auth.store";
import { clearLegacyBonusRecords, useBonusStore } from "@/store/bonus.store";
import {
	clearLegacyBonusToolsRecords,
	useBonusToolsStore,
} from "@/store/bonus-tools.store";

/** Server-backed, in-memory caches. Refetches never overwrite a page draft. */
export function BonusServerCache() {
	const userId = useAuthStore((state) => state.session?.user.id);
	const setProjects = useBonusStore((state) => state.setProjects);
	const setToolsData = useBonusToolsStore((state) => state.setData);
	const appliedForUser = useRef<{ bonuses?: string; tools?: string }>({});
	const previousUserId = useRef<string | undefined>(undefined);
	const bonuses = useQuery({
		queryKey: ["shared-publication", userId, "bonuses", "shared"],
		queryFn: () => contentApi("bonuses"),
		enabled: Boolean(userId),
		refetchInterval: 30000,
		refetchOnWindowFocus: true,
		retry: false,
	});
	const tools = useQuery({
		queryKey: ["shared-publication", userId, "bonus-tools", "shared"],
		queryFn: () => contentApi("bonus-tools"),
		enabled: Boolean(userId),
		refetchInterval: 30000,
		refetchOnWindowFocus: true,
		retry: false,
	});

	useEffect(() => {
		if (previousUserId.current === userId) return;

		previousUserId.current = userId;
		appliedForUser.current = {};
		setProjects([]);
		setToolsData(undefined);
	}, [setProjects, setToolsData, userId]);

	useEffect(() => {
		if (
			!userId ||
			!bonuses.isSuccess ||
			appliedForUser.current.bonuses === userId
		)
			return;

		setProjects(bonuses.data?.data ?? []);
		if (bonuses.data) clearLegacyBonusRecords();
		appliedForUser.current.bonuses = userId;
	}, [bonuses.data, bonuses.isSuccess, setProjects, userId]);

	useEffect(() => {
		if (!userId || !tools.isSuccess || appliedForUser.current.tools === userId)
			return;

		setToolsData(tools.data?.data[0]);
		if (tools.data) clearLegacyBonusToolsRecords();
		appliedForUser.current.tools = userId;
	}, [setToolsData, tools.data, tools.isSuccess, userId]);

	return null;
}
