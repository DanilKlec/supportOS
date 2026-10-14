import { rankKnowledge } from './retrieval.js';
export const kinds=['knowledge','rules','projects','glossary','tests'];
export const emptyDocument=()=>({entries:[],feedback:[]});
const sourceType={knowledge:'material',rules:'rule',projects:'project_instruction',glossary:'glossary'};
function safeSource(entry){
 const type=sourceType[entry.kind];
 if(!type||!entry.id||!entry.title)return null;
 const version=entry.publishedVersionId??entry.published_version_id??entry.version;
 const ref=entry.sourceRef??entry.publishedRef??entry.ref;
 return {id:String(entry.id).slice(0,160),title:String(entry.title).slice(0,240),type,...(entry.project?{project:String(entry.project).slice(0,160)}:{}),...(typeof version==='string'||typeof version==='number'?{version:String(version).slice(0,160)}:{}),...(typeof ref==='string'||typeof ref==='number'?{ref:String(ref).slice(0,160)}:{})};
}
export function buildAIContext(document, request, {draftIds=[],approvedGlossary}={}) {
 const project=String(request.project??''),language=String(request.language??'auto').toLowerCase(),intent=String(request.intent??'general');
 const entries=(document?.entries??[]).flatMap(entry=>{const value=draftIds.includes(entry.id)?entry:entry.published;return value&&entry.status!=='archived'?[{...value,id:entry.id}]:[];});
 const compatible=entries.filter(e=>e.enabled!==false&&(!e.language||e.language.toLowerCase()===language||e.language==='auto')&&(!e.intent||e.intent==='general'||e.intent===intent));
 const globalEntries=compatible.filter(e=>!e.project);
 const projectEntries=project?compatible.filter(e=>e.project===project):[];
 const applicable=[...globalEntries,...projectEntries].sort((a,b)=>(b.priority??0)-(a.priority??0));
 const rules=applicable.filter(e=>e.kind==='rules'),instructions=projectEntries.filter(e=>e.kind==='projects');
 // Glossary terms are deliberately not read from the AI-guidance document. The
 // caller must provide the normalized, published QC glossary explicitly.
 const glossarySource=(Array.isArray(approvedGlossary)?approvedGlossary:[]).map(term=>({id:term.id,title:term.source,content:term.target,language:term.language,project:term.project_id,category:term.note,enabled:term.enabled,priority:term.priority}));
 const glossary=glossarySource.filter(e=>e.enabled!==false&&(!e.project||e.project===project)&&(!e.language||e.language==='auto'||e.language==='any'||e.language.toLowerCase()===language)).slice(0,30);
 const related=new Set(rules.flatMap(rule=>rule.related??[]));
 // Explicitly scoped knowledge remains eligible when question and material use different languages.
 for(const entry of applicable) if(entry.kind==='knowledge'&&entry.intent&&entry.intent!=='general'&&entry.intent===intent)related.add(entry.id);
 const candidates=rankKnowledge(applicable.filter(e=>e.kind==='knowledge'),request.customerMessage,related).slice(0,12);
 const sections=[document?.global??'',...instructions.map(e=>e.content),...rules.map(e=>e.content)].filter(Boolean);
 let used=sections.join('\n\n').length;
 if(used>16000)throw Object.assign(new Error('Инструкции и правила превышают лимит контекста. Сократите их или уточните проект и тему.'),{status:422});
 const knowledge=[];
 for(const entry of candidates){const text=`${entry.title}: ${entry.content}`;const length=text.length+(sections.length?2:0);if(used+length>16000)continue;sections.push(text);used+=length;knowledge.push(entry);}

 const terms=glossary.map(e=>({id:e.id,source:e.title,target:e.content,language:e.language,note:e.category}));
 const seen=new Set();const mergedGlossary=terms.filter(term=>{const key=String(term?.source??'').normalize('NFKC').toLowerCase().trim();if(!key||!term?.target||seen.has(key)||(term.language&&term.language!=='auto'&&term.language!=='any'&&term.language.toLowerCase()!==language))return false;seen.add(key);return true;}).slice(0,30);
 const appliedGlossary=glossary.filter(e=>mergedGlossary.some(term=>term.id===e.id)); const applied=[...instructions,...rules,...knowledge,...appliedGlossary];
 return {approvedGuidance:sections.join('\n\n'),glossary:mergedGlossary,sources:applied.map(safeSource).filter(Boolean),metadata:{project,language,intent,projectIds:instructions.map(e=>e.id),ruleIds:rules.map(e=>e.id),knowledgeIds:knowledge.map(e=>e.id),glossaryIds:appliedGlossary.map(e=>e.id),appliedDraftIds:applied.filter(e=>draftIds.includes(e.id)).map(e=>e.id),omittedKnowledgeIds:candidates.filter(e=>!knowledge.includes(e)).map(e=>e.id),preview:draftIds.length>0}};
}
export function editRuntime(document,body,actor,now=new Date().toISOString()) {
 const entries=[...(document.entries??[])];const index=entries.findIndex(e=>e.id===body.id);const old=entries[index];
 if(body.action==='delete'){if(old?.published)throw new Error('Опубликованный материал можно только архивировать');return {...document,entries:entries.filter(e=>e.id!==body.id)};}
 if(['publish','archive'].includes(body.action)){if(!old)throw new Error('Запись не найдена');entries[index]=body.action==='publish'?{...old,status:'published',published:{...old,published:undefined},publishedAt:now,updatedAt:now,updatedBy:actor}:{...old,status:'archived',published:null,updatedAt:now,updatedBy:actor};return {...document,entries};}
 const input=body.entry;if(!input||!kinds.includes(input.kind))throw new Error('Неверный тип записи');
 const item={id:old?.id??crypto.randomUUID(),kind:input.kind,status:'draft',published:old?.published??null,createdAt:old?.createdAt??now,author:old?.author??actor,updatedAt:now,updatedBy:actor,enabled:input.enabled!==false,priority:Math.min(100,Math.max(0,Number(input.priority)||0))};
 for(const key of ['title','content','project','category','language','intent','reference'])item[key]=String(input[key]??'').trim().slice(0,key==='content'||key==='reference'?8000:160);
 if(!item.title||(!item.content&&item.kind!=='tests'))throw new Error('Заполните название и содержание');
 for(const key of ['required','forbidden','related'])item[key]=(Array.isArray(input[key])?input[key]:[]).filter(x=>typeof x==='string').map(x=>x.trim().slice(0,160)).filter(Boolean).slice(0,30);
 if(index<0){if(entries.length>=150)throw new Error('Лимит 150 записей');entries.push(item);}else entries[index]=item;
 return {...document,entries};
}

