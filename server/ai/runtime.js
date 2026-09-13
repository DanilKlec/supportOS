export const kinds=['knowledge','rules','projects','glossary','tests'];
export const emptyDocument=()=>({entries:[],feedback:[]});
export function buildAIContext(document, request, {draftIds=[]}={}) {
 const project=String(request.project??''),language=String(request.language??'auto'),intent=String(request.intent??'general');
 const entries=(document?.entries??[]).flatMap(entry=>{const value=draftIds.includes(entry.id)?entry:entry.published;return value&&entry.status!=='archived'?[{...value,id:entry.id}]:[];});
 const applicable=entries.filter(e=>e.enabled!==false&&(!e.project||e.project===project)&&(!e.language||e.language===language||e.language==='auto')&&(!e.intent||e.intent==='general'||e.intent===intent)).sort((a,b)=>(b.priority??0)-(a.priority??0));
 const rules=applicable.filter(e=>e.kind==='rules').slice(0,20),instructions=applicable.filter(e=>e.kind==='projects'),glossary=applicable.filter(e=>e.kind==='glossary').slice(0,30);
 const related=new Set(rules.flatMap(rule=>rule.related??[]));
 const knowledge=applicable.filter(e=>e.kind==='knowledge').sort((a,b)=>Number(related.has(b.id))-Number(related.has(a.id))).slice(0,12);
 return {approvedGuidance:[document?.global??'',...instructions.map(e=>e.content),...rules.map(e=>e.content),...knowledge.map(e=>`${e.title}: ${e.content}`)].filter(Boolean).join('\n\n').slice(0,16000),glossary:[...glossary.map(e=>({id:e.id,source:e.title,target:e.content,language:e.language,note:e.category})),...(Array.isArray(request.glossary)?request.glossary:[])].slice(0,30),metadata:{project,language,intent,ruleIds:rules.map(e=>e.id),knowledgeIds:knowledge.map(e=>e.id),glossaryIds:glossary.map(e=>e.id),preview:draftIds.length>0}};
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

