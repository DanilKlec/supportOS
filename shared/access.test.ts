import {expect,it} from 'vitest';
import {can,canAccessPage,routePermission} from './access.js';
it('uses effective database permissions and never infers access from a role label',()=>{
 expect(can('creator','technical')).toBe(false);
 expect(can({status:'active',permissions:['technical']},'technical')).toBe(true);
 expect(can({status:'disabled',permissions:['technical']},'technical')).toBe(false);
 expect(can(undefined,'work')).toBe(false);
 expect(routePermission('/settings/ai/')).toBe('technical');
 expect(routePermission('/bonuses')).toBe('bonuses.read');
 expect(routePermission('/agent-monitor')).toBe('monitor.read');
 expect(routePermission('/project-emails')).toBe('projects.read');
});

it('blocks every QC entry for support while retaining working references',()=>{
 const support={status:'active',permissions:['work','binds.read','projects.read','bonuses.read']};
 for(const [path,hash] of [['/content',''],['/archive',''],['/health',''],['/shared-binds',''],['/shared-binds','proposals'],['/admin','qc'],['/project-emails','content'],['/bonuses','content'],['/bonuses','content-calculator'],['/bonus-tools','content-calculator']]) {
  expect(canAccessPage(support,path,hash),`${path}#${hash}`).toBe(false);
  expect(canAccessPage({...support,permissions:[...support.permissions,'knowledge.write']},path,hash),`${path}#${hash}`).toBe(true);
 }
 for(const [path,hash] of [['/',''],['/project-emails',''],['/bonuses',''],['/bonuses','calculator']]) expect(canAccessPage(support,path,hash)).toBe(true);
 expect(canAccessPage(support,'/content/','#')).toBe(false);
});
