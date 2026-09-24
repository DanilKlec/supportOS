import { expect, it } from 'vitest';
import { emailAddresses, normalizeProjectEmail, mergeEmailImport, projectEmailText } from './project-emails.js';
import { validContent } from '../server/content/validation.js';
const legacy={id:'p',slug:'project',projectName:'Проект',supportEmail:'s@example.com',kycEmail:'k@example.com',vipEmail:'v@example.com',updatedAt:'2026-09-24'};
it('converts old fields without losing addresses and is idempotent',()=>{
 const value=normalizeProjectEmail(legacy);
 expect(value.emails.map(e=>e.type)).toEqual(['Support','KYC','VIP']);
 expect(value.supportEmail).toBe(legacy.supportEmail);
 expect(normalizeProjectEmail(value)).toEqual(value);
 expect(value.emails[0].id).toBe(normalizeProjectEmail(legacy).emails[0].id);
});
it('keeps custom types and comments through import and publication validation',()=>{
 const existing=normalizeProjectEmail({...legacy,emails:[...emailAddresses(legacy),{id:'finance',type:'Finance',email:'f@example.com',note:'Только выплаты'}]});
 const result=mergeEmailImport(existing,{...legacy,id:'import',supportEmail:'new@example.com'});
 expect(result.id).toBe('p');
 expect(emailAddresses(result)).toContainEqual({id:'finance',type:'Finance',email:'f@example.com',note:'Только выплаты'});
 expect(result.supportEmail).toBe('new@example.com');
 expect(validContent('emails',[result])).toBe(true);
 expect(projectEmailText(result)).toContain('Finance: f@example.com');
 expect(projectEmailText(result)).toContain('Support: new@example.com');
});
it('does not resurrect an intentionally removed legacy address',()=>{
 const value=normalizeProjectEmail({...legacy,emails:[{id:'finance',type:'Финансы',email:'f@example.com'}]});
 expect(value.supportEmail).toBe('');expect(emailAddresses(value)).toHaveLength(1);
});
it('rejects invalid, duplicate or oversized custom email records',()=>{
 for(const emails of [[{id:'1',type:'Финансы',email:'bad'}],[{id:'1',type:'',email:'a@b.com'}],[{id:'1',type:'x',email:'a@b.com'},{id:'1',type:'y',email:'c@d.com'}],Array.from({length:101},(_,i)=>({id:String(i),type:'x',email:'a@b.com'}))])expect(validContent('emails',[{...legacy,emails}])).toBe(false);
});
