export const roles = ['support','shift','admin','qc','creator'];
export const roleLabels = {support:'Support',shift:'Shift',admin:'Admin',qc:'QC',creator:'Creator',pending:'Без доступа'};
export function normalizeRole(value) {
 const role=typeof value==='string'?value.toLowerCase():'';
 return roles.includes(role)?role:({user:'support',supervisor:'shift'}[role] ?? 'pending');
}
export function can(access, permission) {
 return access?.status==='active' && Array.isArray(access.permissions) && access.permissions.includes(permission);
}
export function routePermission(path) {
 path=path.replace(/\/+$/,'')||'/';
 if(['/settings/ai','/settings/translator'].includes(path)) return 'technical';
 if(path==='/ai/knowledge') return 'ai.train';
 if(path==='/agent-monitor'||path.startsWith('/agent-monitor/')) return 'monitor.read';
 if(path==='/settings/users'||path.startsWith('/settings/users/')) return 'users.manage';
 if(path==='/import/google-sheets'||path.startsWith('/import/google-sheets/')) return 'knowledge.write';
 if(path==='/shared-binds')return 'knowledge.write';
 if(['/','/binds','/favorites','/recent'].includes(path))return 'binds.read';
 if(path==='/project-emails')return 'projects.read';
 if(['/bonuses','/bonus-tools'].includes(path))return 'bonuses.read';
 return ['/settings','/login'].includes(path)?'work':'tools';
}
