export const roles = ['support','shift','admin','qc','creator'];
export const roleLabels = {support:'Support',shift:'Shift',admin:'Admin',qc:'QC',creator:'Creator',pending:'Без доступа'};
export function normalizeRole(value) {
 const role=typeof value==='string'?value.toLowerCase():'';
 return roles.includes(role)?role:({user:'support',supervisor:'shift'}[role] ?? 'pending');
}
export function can(access, permission) {
 return access?.status==='active' && Array.isArray(access.permissions) && access.permissions.includes(permission);
}
export function canTrain(access) { return ['ai.train','ai.rules','ai.playground','ai.tests','ai.publish'].some(permission=>can(access,permission)); }
export function canAdmin(access) { return ['users.manage','roles.manage','technical'].some(permission=>can(access,permission)); }
export const adminPermissions = {overview:'users.manage',users:'users.manage',roles:'roles.manage',audit:'users.manage',knowledge:'ai.train',rules:'ai.rules',projects:'ai.train',glossary:'ai.train',playground:'ai.playground',tests:'ai.tests',feedback:'ai.train',access:'users.manage','platform-projects':'technical',integrations:'technical',jobs:'technical','system-health':'technical',ai:'technical',models:'technical',learning:'technical',usage:'technical',logs:'technical',flags:'technical'};
export const qcPermissions={overview:'knowledge.write',inbox:'knowledge.write',candidates:'knowledge.write',proposals:'knowledge.write',materials:'knowledge.write',gaps:'knowledge.write',conflicts:'knowledge.write',duplicates:'knowledge.write',glossary:'ai.train',quality:'knowledge.write',languages:'knowledge.write',reviews:'knowledge.write',trends:'knowledge.write',history:'knowledge.write',knowledge:'ai.train',rules:'ai.rules',instructions:'ai.train',playground:'ai.playground',tests:'ai.tests',feedback:'ai.train'};
export function routePermission(path, hash='') {
 path=path.replace(/\/+$/,'')||'/';
 hash=hash.replace(/^#/,'');
 if(path==='/qc')return qcPermissions[hash||'overview']??'knowledge.write';
 if(path==='/admin')return adminPermissions[hash] ?? (hash==='qc'?'knowledge.write':['integrations','system'].includes(hash)?'technical':'work');
 if(path==='/settings'&&hash.startsWith('integrations'))return 'technical';
 if(path==='/settings'&&hash==='data')return 'binds.read';
 if(path==='/'&&hash.startsWith('composer'))return hash==='composer-translate'?'translator.use':'composer.use';
 if(path==='/ai/assistant')return 'composer.use';
 if(['/settings/ai','/settings/translator'].includes(path)) return 'technical';
 if(path==='/ai/knowledge') return 'ai.train';
 if(path==='/translator'||path==='/ai/translator')return 'translator.use';
 if(path==='/agent-monitor'||path.startsWith('/agent-monitor/')) return 'monitor.read';
 if(path==='/settings/users'||path.startsWith('/settings/users/')) return 'users.manage';
 if(path==='/import/google-sheets'||path.startsWith('/import/google-sheets/')) return 'knowledge.write';
 if(path==='/team')return 'monitor.read';
 if(path==='/health')return 'knowledge.write';
 if(path==='/archive')return 'knowledge.write';
 if(path==='/content')return 'knowledge.write';
 if(path==='/shared-binds')return 'knowledge.write';
 if(['/','/binds','/favorites','/recent'].includes(path))return 'binds.read';
 if(path==='/project-emails')return 'projects.read';
 if(['/bonuses','/bonus-tools'].includes(path))return 'bonuses.read';
 return ['/settings','/login'].includes(path)?'work':'tools';
}
// UI and direct-link gates share the same effective-permission checks.
export function canAccessPage(access, path, hash='') {
 path=path.replace(/\/+$/,'')||'/';hash=hash.replace(/^#/,'');
 if(path==='/qc')return (!hash?Object.values(qcPermissions).some(permission=>can(access,permission)):Object.hasOwn(qcPermissions,hash)&&can(access,qcPermissions[hash]));
 if(path==='/admin'&&!hash)return canAdmin(access);
 if(path==='/admin'&&hash&&!Object.hasOwn(adminPermissions,hash)&&!['qc','integrations','system'].includes(hash))return false;
 if(['/project-emails','/bonuses','/bonus-tools'].includes(path)&&['content','content-calculator'].includes(hash))return can(access,'knowledge.write')&&can(access,routePermission(path));
 if(path==='/team')return can(access,'monitor.read')||can(access,'users.manage');
 if(path==='/'&&hash.startsWith('composer'))return can(access,'binds.read')&&can(access,'composer.use')&&(hash!=='composer-translate'||can(access,'translator.use'));
 if(['/translator','/ai/translator'].includes(path))return can(access,'binds.read')&&can(access,'composer.use')&&can(access,'translator.use');
 if(path==='/ai/assistant')return can(access,'binds.read')&&can(access,'composer.use');
 if(['/project-emails','/bonuses','/bonus-tools'].includes(path)&&hash.includes('manage'))return can(access,routePermission(path))&&can(access,path==='/project-emails'?'projects.write':'bonuses.write');
 return can(access,routePermission(path,hash));
}
