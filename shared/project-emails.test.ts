import { expect, it } from 'vitest';
import { emailAddresses, normalizeProjectEmail, mergeEmailImport, projectEmailText } from './project-emails.js';
import { validContent } from '../server/content/validation.js';
const legacy={id:'p',slug:'project',projectName:'Проект',supportEmail:'s@example.com',kycEmail:'k@example.com',vipEmail:'v@example.com',updatedAt:'2026-09-24'};
it('converts old fields without losing addresses and is idempotent',()=>{
 const value=normalizeProjectEmail(legacy);
 expect(value.addresses.map(e=>e.type)).toEqual(['Support','KYC','VIP']);
 expect(value.addresses.map(e=>e.order)).toEqual([0,1,2]);
 expect(value.supportEmail).toBe(legacy.supportEmail);
 expect(normalizeProjectEmail(value)).toEqual(value);
 expect(value.addresses[0].id).toBe(normalizeProjectEmail(legacy).addresses[0].id);
});
it('keeps custom types and comments through import and publication validation',()=>{
 const existing=normalizeProjectEmail({...legacy,emails:[...emailAddresses(legacy),{id:'finance',type:'Finance',email:'f@example.com',note:'Только выплаты'}]});
 const result=mergeEmailImport(existing,{...legacy,id:'import',supportEmail:'new@example.com'});
 expect(result.id).toBe('p');
 expect(emailAddresses(result)).toContainEqual({id:'finance',type:'Finance',email:'f@example.com',note:'Только выплаты',order:3});
 expect(result.addresses.map(row=>row.type)).toEqual(['Support','KYC','VIP','Finance']);
 expect(result.supportEmail).toBe('new@example.com');
 expect(validContent('emails',[result])).toBe(true);
 expect(projectEmailText(result)).toContain('Finance: f@example.com');
 expect(projectEmailText(result)).toContain('Support: new@example.com');
});
it('does not resurrect an intentionally removed legacy address',()=>{
 const value=normalizeProjectEmail({...legacy,emails:[{id:'finance',type:'Финансы',email:'f@example.com'}]});
 expect(value.supportEmail).toBe('');expect(emailAddresses(value)).toHaveLength(1);
});
it('treats ordered addresses as authoritative and preserves custom types',()=>{
 const value=normalizeProjectEmail({...legacy,addresses:[
  {id:'complaints',type:'Complaints',email:'complaints@example.com',order:4},
  {id:'finance',type:'Finance',email:'finance@example.com',note:'Invoices',order:1},
 ]});
 expect(value.addresses.map(({id,order})=>({id,order}))).toEqual([
  {id:'finance',order:0},{id:'complaints',order:1},
 ]);
 expect(value.supportEmail).toBe('');
 expect(normalizeProjectEmail({...value,addresses:[]}).addresses).toEqual([]);
 expect(projectEmailText(value)).toContain('Finance: finance@example.com');
});
it('rejects invalid, duplicate or oversized custom email records',()=>{
 for(const emails of [[{id:'1',type:'Финансы',email:'bad'}],[{id:'1',type:'',email:'a@b.com'}],[{id:'1',type:'x',email:'a@b.com'},{id:'1',type:'y',email:'c@d.com'}],Array.from({length:101},(_,i)=>({id:String(i),type:'x',email:'a@b.com'}))])expect(validContent('emails',[{...legacy,emails}])).toBe(false);
});
