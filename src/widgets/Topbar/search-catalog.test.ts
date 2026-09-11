import {it,expect} from 'vitest';
import {catalogResults} from './search-catalog';
import {searchBinds} from '@/shared/lib/bind-search';
it('indexes separate mail addresses and multilingual bonus content',()=>{
 const rows=catalogResults([{id:'p',projectName:'Example',slug:'example',supportEmail:'help@example.com',kycEmail:'verify@example.com',vipEmail:'',updatedAt:''}],[{id:'p',name:'Example',slug:'example',updatedAt:'',bonuses:[{id:'b',name:'Welcome',content:'Бонус',order:0,translations:[{language:'en',content:'Deposit reward',updatedAt:''}]}]}]);
 expect(rows).toHaveLength(3);
 expect(new Set(rows.map(r=>r.id)).size).toBe(3);
 expect(rows.find(r=>r.resultKind==='bonus')?.translations[0].content).toBe('Deposit reward');
 expect(searchBinds(rows,'verify@example.com',{language:'ru',categories:[],folders:[]})[0].id).toBe('email:p:KYC');
 expect(catalogResults([],[])).toEqual([]);
});
