import {expect,it} from 'vitest';
import {bonusStatus} from './bonus-freshness';
import {validContent} from '../../../server/content/validation.js';
it('handles inclusive expiry, due review and unverified legacy bonuses',()=>{
 expect(bonusStatus({},'2026-09-11').label).toBe('Требует проверки');
 expect(bonusStatus({validUntil:'2026-09-10',checkedAt:'2026-09-10'},'2026-09-11').label).toBe('Срок истёк');
 expect(bonusStatus({validUntil:'2026-09-11',checkedAt:'2026-09-10'},'2026-09-11').label).toBe('Проверен');
 expect(bonusStatus({reviewDue:'2026-09-11',checkedAt:'2026-09-10'},'2026-09-11').label).toBe('Пора проверить');
});
it('validates metadata and continues to accept existing catalogs',()=>{
 const check=(extra:Record<string,unknown>)=>validContent('bonuses',[{id:'p',slug:'p',name:'P',bonuses:[{id:'b',name:'B',content:'C',order:0,...extra}]}]);
 expect(check({})).toBe(true);expect(check({validUntil:'2026-09-30',reviewDue:'2026-09-15',responsible:'QC',checkedAt:'2026-09-11T12:00:00Z'})).toBe(true);
 expect(check({validUntil:'2026-02-30'})).toBe(false);expect(check({responsible:'x'.repeat(121)})).toBe(false);expect(check({checkedAt:'bad'})).toBe(false);
});
