import {expect,it} from 'vitest';
import {buildAIContext,editRuntime,emptyDocument} from './runtime.js';
const input={kind:'knowledge',title:'Finance',content:'Approved finance policy',project:'windetta',language:'ru',intent:'withdrawal',enabled:true};
it('keeps drafts private, preserves published content while editing, and archives explicitly',()=>{
 let doc=editRuntime(emptyDocument(),{action:'save',entry:input},'admin');const id=doc.entries[0].id;
 const request={project:'windetta',language:'ru',intent:'withdrawal'};
 expect(buildAIContext(doc,request).approvedGuidance).toBe('');
 expect(buildAIContext(doc,request,{draftIds:[id]}).approvedGuidance).toContain(input.content);
 doc=editRuntime(doc,{action:'publish',id},'admin');
 doc=editRuntime(doc,{action:'save',id,entry:{...input,content:'Unapproved replacement'}},'admin');
 expect(buildAIContext(doc,request).approvedGuidance).toContain(input.content);
 expect(buildAIContext(doc,request).approvedGuidance).not.toContain('Unapproved');
 expect(buildAIContext(doc,request,{draftIds:[id]}).approvedGuidance).toContain('Unapproved');
 expect(buildAIContext(doc,{...request,project:'other'}).approvedGuidance).toBe('');
 expect(buildAIContext(doc,{...request,language:'en'}).approvedGuidance).toBe('');
 expect(()=>editRuntime(doc,{action:'delete',id},'admin')).toThrow();
 doc=editRuntime(doc,{action:'archive',id},'admin');expect(buildAIContext(doc,request).approvedGuidance).toBe('');
});
it('extends global context with matching project instructions, rules and glossary',()=>{
 const entries=[{id:'p',kind:'projects',content:'Project instructions',project:'p'},{id:'r',kind:'rules',content:'No promises',intent:'withdrawal'},{id:'g',kind:'glossary',title:'withdrawal',content:'вывод',language:'ru'},{id:'other',kind:'rules',content:'Wrong rule',project:'other'}].map(e=>({...e,status:'published',published:e}));
 const context=buildAIContext({global:'Global policy',entries},{project:'p',language:'ru',intent:'withdrawal'});
 expect(context.approvedGuidance).toBe('Global policy\n\nProject instructions\n\nNo promises');
 expect(context.metadata.ruleIds).toEqual(['r']);expect(context.glossary[0].target).toBe('вывод');expect(context.metadata.preview).toBe(false);
});
it('retrieves relevant approved knowledge over unrelated high-priority records',()=>{
 const entries=Array.from({length:15},(_,i)=>({id:`bonus-${i}`,kind:'knowledge',title:'Bonus',content:'Bonus rules',priority:100}));
 entries.push({id:'withdrawal',kind:'knowledge',title:'Withdrawal review',content:'Contact finance',priority:1});
 const document={entries:entries.map(entry=>({...entry,status:'published',published:entry}))};
 const context=buildAIContext(document,{customerMessage:'Withdrawal pending',language:'en'});
 expect(context.metadata.knowledgeIds).toEqual(['withdrawal']);
 expect(context.approvedGuidance).not.toContain('Bonus rules');
});
it('reports only drafts actually used for this request and preserves project isolation',()=>{
 const entry={...input,id:'draft',status:'draft'};
 expect(buildAIContext({entries:[entry]},{project:'other',language:'ru',intent:'withdrawal',customerMessage:'help'},{draftIds:['draft']}).metadata.appliedDraftIds).toEqual([]);
 expect(buildAIContext({entries:[entry]},{project:'windetta',language:'ru',intent:'withdrawal',customerMessage:'help'},{draftIds:['draft']}).metadata.appliedDraftIds).toEqual(['draft']);
});
it('does not let client glossary override published terminology',()=>{
 const entry={id:'g',kind:'glossary',title:'withdrawal',content:'вывод средств',language:'ru'};
 const context=buildAIContext({entries:[{...entry,status:'published',published:entry}]},{language:'ru',glossary:[{source:'Withdrawal',target:'wrong',language:'ru'}]});
 expect(context.glossary).toHaveLength(1);expect(context.glossary[0].target).toBe('вывод средств');
});
it('fails explicitly instead of silently truncating mandatory rules',()=>{
 expect(()=>buildAIContext({global:'x'.repeat(16001)},{language:'en'})).toThrow('лимит контекста');
});
