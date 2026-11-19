import { can } from './access.js';

export function chatCapabilities(access) {
	const work = can(access, 'work');
	const roles = new Set(access?.roles?.map((role) => role.id));
	const creator = work && roles.has('creator') && can(access, 'technical');
	const admin = work && (roles.has('admin') || creator);
	const qc = work && roles.has('qc');
	const supervise = work && (admin || can(access, 'monitor.read'));
	return {
		role: creator ? 'creator' : admin ? 'admin' : qc ? 'qc' : roles.has('shift') ? 'shift' : 'support',
		supervise,
		manageRouting: supervise && (admin || qc),
		manageProjects: admin,
		manageWebhooks: creator,
		deleteProjects: creator,
		manageAllChats: admin,
		reviewNotes: supervise && (qc || admin),
	};
}

export function chatConversationAccess(capabilities, { assigneeId, agentId, member, unassigned, active }) {
	const own = member && agentId > 0 && assigneeId === agentId;
	const canRead = capabilities.supervise || own || (member && active && unassigned);
	return {
		read: canRead,
		write: canRead && (capabilities.manageAllChats || own),
		note: canRead && (capabilities.reviewNotes || own),
		take: member && active && unassigned,
		seeIp: canRead && (capabilities.supervise || own),
	};
}
