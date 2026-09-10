import {expect,it} from 'vitest';
import {can,routePermission} from './access.js';
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
