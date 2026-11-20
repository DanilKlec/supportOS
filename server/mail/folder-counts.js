const counters = new Map();

async function countVirtualFolder(gmail, id) {
	const params = new URLSearchParams({ maxResults: '500', fields: 'messages(id),nextPageToken', labelIds: 'UNREAD' });
	if (id === 'SNOOZED') params.set('q', 'is:snoozed');
	let count = 0;
	let token;
	do {
		if (token) params.set('pageToken', token);
		const page = await gmail(`/messages?${params}`);
		count += page.messages?.length ?? 0;
		token = page.nextPageToken;
	} while (token);
	return count;
}

export function folderCount(gmail, mailbox, id) {
	let entry = counters.get(mailbox.id);
	if (!entry || entry.version !== mailbox.encrypted_token) {
		if (counters.size >= 200) counters.delete(counters.keys().next().value);
		entry = { version: mailbox.encrypted_token, folders: new Map() };
		counters.set(mailbox.id, entry);
	}
	const { folders } = entry;
	const cached = folders.get(id);
	if (cached?.expires > Date.now()) return cached.promise;
	const value = { expires: Date.now() + 20_000 };
	const field = id === 'DRAFT' ? 'messagesTotal' : 'messagesUnread';
	value.promise = (id === 'ALL' || id === 'SNOOZED'
		? countVirtualFolder(gmail, id)
		: gmail(`/labels/${id}?fields=${field}`).then((label) => label[field] ?? 0)
	).catch((error) => {
		if (folders.get(id) === value) folders.delete(id);
		throw error;
	});
	folders.set(id, value);
	return value.promise;
}

export function invalidateFolderCounts(mailbox, ids) {
	if (!ids) {
		counters.delete(mailbox);
		return;
	}
	const folders = counters.get(mailbox)?.folders;
	if (folders) for (const id of ids) folders.delete(id);
}
