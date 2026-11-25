async function mapInBatches(items, fn) {
	const result = [];
	for (let offset = 0; offset < items.length; offset += 6)
		result.push(...await Promise.all(items.slice(offset, offset + 6).map(fn)));
	return result;
}

function count(meta, key) {
	const value = meta?.[key] ?? meta?.count?.[key];
	return value != null && value !== '' && Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? Number(value) : null;
}

function sum(values) {
	return values.includes(null) ? null : values.reduce((total, value) => total + value, 0);
}

async function onlineVisitors(request, siteIds) {
	const page = (number) => request(`/contacts/active?include_contact_inboxes=true&page=${number}`);
	const first = await page(1);
	const total = count(first?.meta, 'count');
	if (total === null || total > 1500) throw new Error('Online visitor data unavailable');
	const pages = await mapInBatches(Array.from({ length: Math.max(0, Math.ceil(total / 15) - 1) }, (_, i) => i + 2), page);
	const counts = new Map(siteIds.map((id) => [id, new Set()]));
	const online = new Set();
	for (const result of [first, ...pages]) {
		if (!Array.isArray(result?.payload)) throw new Error('Invalid online contacts response');
		for (const contact of result.payload) {
			if (!Array.isArray(contact.contact_inboxes)) continue;
			for (const source of contact.contact_inboxes) {
				const visitors = counts.get(Number(source.inbox?.id));
				if (!visitors) continue;
				visitors.add(contact.id);
				online.add(contact.id);
			}
		}
	}
	return { online: online.size, counts };
}

export async function activityBySite(request, sites) {
	const [visitors, rows] = await Promise.all([
		sites.length ? onlineVisitors(request, sites.map((site) => Number(site.id))).catch(() => null) : { online: 0 },
		mapInBatches(sites, async ({ id, name, website_url }) => {
			const statuses = await Promise.all(['open', 'pending'].map((status) => request(
				`/conversations/meta?status=${status}&inbox_id=${id}`,
			).then((row) => row?.data?.meta ?? row?.meta).catch(() => null)));
			return {
				id, name, url: website_url, active: sum(statuses.map((meta) => count(meta, 'all_count'))),
				queue: sum(statuses.map((meta) => count(meta, 'unassigned_count'))),
			};
		}),
	]);
	return {
		online: visitors?.online ?? null, active: sum(rows.map((row) => row.active)), queue: sum(rows.map((row) => row.queue)),
		sites: rows.map((row) => ({ ...row, online: visitors?.counts?.get(Number(row.id))?.size ?? null })),
		updatedAt: new Date().toISOString(),
	};
}

export async function countConnectedBots(request, inboxes) {
	const bindings = await mapInBatches(inboxes, (inbox) => request(`/inboxes/${inbox.id}/agent_bot`));
	const ids = bindings.map((binding) => Number(binding?.agent_bot?.id)).filter((id) => Number.isSafeInteger(id) && id > 0);
	return new Set(ids).size;
}

export function cachedSnapshot(cache, key, ms, load) {
	let entry = cache.get(key);
	if (!entry || entry.until <= Date.now()) {
		entry = { until: Date.now() + ms, snapshot: load() };
		cache.set(key, entry);
		void entry.snapshot.catch(() => {
			if (cache.get(key) === entry) cache.delete(key);
		});
	}
	return entry.snapshot;
}
