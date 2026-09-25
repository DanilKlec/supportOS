import {requireUser} from '../_auth.js';
import {safeKnowledgeTopic} from '../../shared/knowledge-gap.js';
import {can} from '../../shared/access.js';
import {config,db,allRows} from '../agent-monitor/_server.js';
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const knowledgeTables={category:'supportos_categories',folder:'supportos_folders',bind:'supportos_binds'};
const validId=id=>typeof id==='string'&&/^[a-z0-9][a-z0-9:._-]{0,199}$/i.test(id);
const list=value=>value===undefined?[]:Array.isArray(value)&&value.length<=1000?value:null;
const optional=(value,max=2000)=>value==null?null:typeof value==='string'&&value.length<=max?value:null;

function categoryFromRow(row){return {id:row.id,ownerId:row.owner_id,name:row.name,icon:row.icon??undefined,color:row.color??undefined,order:row.order_index};}
function folderFromRow(row){return {id:row.id,ownerId:row.owner_id,categoryId:row.category_id,parentId:row.parent_id??undefined,name:row.name,icon:row.icon??undefined,color:row.color??undefined,order:row.order_index};}
function bindFromRow(row,history=[]){return {id:row.id,ownerId:row.owner_id,sourceBindId:row.source_bind_id??undefined,sourceHash:row.source_hash??undefined,importBatchId:row.import_batch_id??undefined,imported:Boolean(row.imported),slug:row.slug,categoryId:row.category_id,folderId:row.folder_id??undefined,icon:row.icon??undefined,color:row.color??undefined,tags:Array.isArray(row.tags)?row.tags:[],translations:Array.isArray(row.translations)?row.translations:[],history,aiGenerated:row.ai_generated??undefined,aiTranslated:row.ai_translated??undefined,aiSummary:row.ai_summary??undefined,favorite:Boolean(row.favorite),archived:Boolean(row.archived),createdAt:row.created_at,updatedAt:row.updated_at};}

function pageParam(value,fallback,{min,max}){
 if(value==null)return fallback;
 if(!/^\d+$/.test(value))throw fail('Некорректные параметры страницы');
 const parsed=Number(value);
 if(!Number.isSafeInteger(parsed)||parsed<min||parsed>max)throw fail('Некорректные параметры страницы');
 return parsed;
}

async function sharedPage(env,url){
 const limit=pageParam(url.searchParams.get('limit'),500,{min:1,max:500});
 const offset=pageParam(url.searchParams.get('offset'),0,{min:0,max:10000000});
 const rows=await db(env,`supportos_binds?select=*&owner_id=is.null&order=id.asc&limit=${limit}&offset=${offset}`);
 return {rows};
}

function sharedContent(body,stamp){
 if(!Array.isArray(body.translations)||!body.translations.length||body.translations.length>1000||!Array.isArray(body.tags)||body.tags.length>1000)throw fail('Некорректный общий бинд');
 const translations=body.translations.map(item=>{
  if(!item||typeof item.language!=='string'||!item.language.trim()||item.language.length>40||typeof item.title!=='string'||!item.title.trim()||item.title.length>1000||typeof item.content!=='string'||!item.content.trim()||item.content.length>100000)throw fail('Заполните название и текст каждого перевода');
  if(item.agentInstructions!=null&&(typeof item.agentInstructions!=='string'||item.agentInstructions.length>16000)||item.aiGenerated!=null&&typeof item.aiGenerated!=='boolean')throw fail('Некорректный перевод');
  return {language:item.language.trim(),title:item.title.trim(),content:item.content.trim(),updatedAt:stamp,...(item.agentInstructions==null?{}:{agentInstructions:item.agentInstructions}),...(item.aiGenerated==null?{}:{aiGenerated:item.aiGenerated})};
 });
 if(new Set(translations.map(item=>item.language)).size!==translations.length)throw fail('Языки переводов не должны повторяться');
 const tags=[...new Set(body.tags.map(tag=>{
  if(typeof tag!=='string'||tag.length>300)throw fail('Некорректные теги');
  return tag.trim();
 }).filter(Boolean))];
 return {translations,tags};
}

async function saveShared(env,actor,body){
 if(!can(actor.access,'knowledge.write'))throw fail('Нет права редактировать общие бинды',403);
 if(JSON.stringify(body).length>3000000)throw fail('Превышен размер бинда');
 const stamp=new Date().toISOString();
 const content=sharedContent(body,stamp);
 let rows;
 if(body.id!=null){
  if(!validId(body.id)||typeof body.expected!=='string'||body.expected.length>100)throw fail('Некорректная версия общего бинда');
  rows=await rest(env,`supportos_binds?id=eq.${encodeURIComponent(body.id)}&owner_id=is.null&updated_at=eq.${encodeURIComponent(body.expected)}&select=*`,{method:'PATCH',body:{...content,updated_at:stamp},prefer:'return=representation'});
  if(!Array.isArray(rows)||!rows.length)throw fail('Бинд изменён другим сотрудником или доступ отозван.',409);
 }else{
  if(body.expected!=null)throw fail('Некорректная версия общего бинда');
  const id=`shared-${globalThis.crypto.randomUUID()}`;
  rows=await rest(env,'supportos_binds?select=*',{method:'POST',body:{id,owner_id:null,slug:`shared-${globalThis.crypto.randomUUID()}`,category_id:'supportos-shared',...content,favorite:false,archived:false,created_at:stamp,updated_at:stamp},prefer:'return=representation'});
 }
 if(!Array.isArray(rows)||!rows[0])throw fail('Сервер не подтвердил сохранение общего бинда',502);
 return rows[0];
}

async function knowledgeSnapshot(env,actor){
 const owner=`or=(owner_id.is.null,owner_id.eq.${actor.id})`;
 const [categories,folders,rawBinds,historyRows]=await Promise.all([
  allRows(env,`supportos_categories?select=*&${owner}&order=order_index.asc,id.asc`),
  allRows(env,`supportos_folders?select=*&${owner}&order=order_index.asc,id.asc`),
  allRows(env,`supportos_binds?select=*&${owner}&order=updated_at.desc,id.asc`),
  db(env,`supportos_bind_history?select=id,source_id,owner_id,snapshot,created_at,operation&${owner}&order=created_at.desc,id.desc&limit=5000`),
 ]);
 const personalSources=new Set(rawBinds.filter(row=>row.owner_id&&row.source_bind_id).map(row=>row.source_bind_id));
 const binds=rawBinds.filter(row=>row.owner_id||!personalSources.has(row.id));
 const historyBySource=new Map();
 for(const row of historyRows){
  const key=`${row.owner_id??'shared'}:${row.source_id}`;const history=historyBySource.get(key)??[];
  if(history.length<26)history.push(row);historyBySource.set(key,history);
 }
 return {categories:categories.map(categoryFromRow),folders:folders.map(folderFromRow),binds:binds.map(row=>{
  const key=`${row.owner_id??'shared'}:${row.source_bind_id??row.id}`;
  const history=(historyBySource.get(key)??[]).filter(item=>item.snapshot?.updated_at!==row.updated_at).slice(0,25).map(item=>({id:String(item.id),createdAt:item.created_at,slug:item.snapshot?.slug??row.slug,tags:Array.isArray(item.snapshot?.tags)?item.snapshot.tags:[],translations:Array.isArray(item.snapshot?.translations)?item.snapshot.translations:[]}));
  return bindFromRow(row,history);
 })};
}

async function rest(env,path,{method='GET',body,prefer}={}){
 const response=await fetch(`${env.SUPABASE_URL.replace(/\/$/,'')}/rest/v1/${path}`,{
  method,headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,'Content-Type':'application/json',...(prefer?{Prefer:prefer}:{})},
  body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)
 });
 const text=await response.text();const result=text?JSON.parse(text):null;
 if(!response.ok)throw fail(response.status===409?'Данные уже изменены. Обновите базу знаний.':'Не удалось сохранить базу знаний',response.status===409?409:502);
 return result;
}

async function existingOwners(env,table,ids){
 const owners=new Map();
 for(let offset=0;offset<ids.length;offset+=100){
  const chunk=ids.slice(offset,offset+100).map(encodeURIComponent).join(',');
  const rows=await db(env,`${table}?select=id,owner_id&id=in.(${chunk})`);
  for(const row of rows)owners.set(row.id,row.owner_id);
 }
 return owners;
}

function ownerFor(item,owners,actor,writable){
 if(owners.has(item.id)){
  const owner=owners.get(item.id);
  if(owner===null&&!writable)throw fail('Нет права редактировать общую базу знаний',403);
  if(owner!==null&&owner!==actor.id)throw fail('Нельзя изменять данные другого сотрудника',403);
  return owner;
 }
 if(item.ownerId===null||item.ownerId===undefined&&writable){
  if(!writable)throw fail('Нет права создавать общие материалы',403);
  return null;
 }
 return actor.id;
}

async function saveKnowledge(env,actor,body){
 const categories=list(body.categories),folders=list(body.folders),binds=list(body.binds);
 if(!categories||!folders||!binds||JSON.stringify(body).length>3000000)throw fail('Некорректные данные или превышен размер импорта');
 const writable=can(actor.access,'knowledge.write');
 const stamp=new Date().toISOString();
 const groups=[
  {table:knowledgeTables.category,items:categories,map:(item,owner)=>{
   if(!validId(item?.id)||typeof item.name!=='string'||!item.name.trim()||!Number.isFinite(item.order))throw fail('Некорректная категория');
   return {id:item.id,owner_id:owner,name:item.name.trim().slice(0,300),icon:optional(item.icon,100),color:optional(item.color,100),order_index:item.order,updated_at:stamp};
  }},
  {table:knowledgeTables.folder,items:folders,map:(item,owner)=>{
   if(!validId(item?.id)||!validId(item.categoryId)||typeof item.name!=='string'||!item.name.trim()||!Number.isFinite(item.order)||(item.parentId!=null&&!validId(item.parentId)))throw fail('Некорректная папка');
   return {id:item.id,owner_id:owner,category_id:item.categoryId,parent_id:item.parentId??null,name:item.name.trim().slice(0,300),icon:optional(item.icon,100),color:optional(item.color,100),order_index:item.order,updated_at:stamp};
  }},
  {table:knowledgeTables.bind,items:binds,map:(item,owner)=>{
   if(!validId(item?.id)||!validId(item.categoryId)||typeof item.slug!=='string'||!item.slug.trim()||(item.folderId!=null&&!validId(item.folderId))||!Array.isArray(item.tags)||!Array.isArray(item.translations))throw fail('Некорректный бинд');
   return {id:item.id,owner_id:owner,source_bind_id:item.sourceBindId??null,source_hash:item.sourceHash??null,import_batch_id:item.importBatchId??null,imported:Boolean(item.imported),slug:item.slug.trim().slice(0,300),category_id:item.categoryId,folder_id:item.folderId??null,icon:optional(item.icon,100),color:optional(item.color,100),tags:item.tags,translations:item.translations,ai_generated:item.aiGenerated??null,ai_translated:item.aiTranslated??null,ai_summary:optional(item.aiSummary,16000),favorite:Boolean(item.favorite),archived:Boolean(item.archived),created_at:item.createdAt??stamp,updated_at:stamp};
  }},
 ];
 for(const group of groups){
  if(!group.items.length)continue;
  const owners=await existingOwners(env,group.table,group.items.map(item=>item?.id).filter(validId));
  const mapped=group.items.map(item=>group.map(item,ownerFor(item,owners,actor,writable)));
  await rest(env,`${group.table}?on_conflict=id`,{method:'POST',body:mapped,prefer:'resolution=merge-duplicates,return=minimal'});
 }
 return {ok:true};
}

async function deleteKnowledge(env,actor,body){
 const table=knowledgeTables[body.entity];
 if(!table||!validId(body.id))throw fail('Некорректный объект базы знаний');
 const rows=await db(env,`${table}?select=id,owner_id&id=eq.${encodeURIComponent(body.id)}`);
 const existing=rows[0];
 if(!existing)return {ok:true};
 if(existing.owner_id===null&&!can(actor.access,'knowledge.write'))throw fail('Нет права редактировать общую базу знаний',403);
 if(existing.owner_id!==null&&existing.owner_id!==actor.id)throw fail('Нельзя изменять данные другого сотрудника',403);
 const owner=existing.owner_id===null?'owner_id=is.null':`owner_id=eq.${actor.id}`;
 await rest(env,`${table}?id=eq.${encodeURIComponent(body.id)}&${owner}`,{method:'DELETE',prefer:'return=minimal'});
 return {ok:true};
}
export default async function handler(req,res) {
 res.setHeader('Cache-Control','private, no-store');res.setHeader('Content-Type','application/json; charset=utf-8');
 const send=(status,value)=>{res.statusCode=status;res.end(JSON.stringify(value));};
 try {
  if(!['GET','POST'].includes(req.method))return send(405,{error:'Method not allowed'});
  if(req.method==='POST'&&(!req.headers.origin||new URL(req.headers.origin).host!==req.headers.host))throw fail('Invalid origin',403);
  const actor=await requireUser(req,{permission:'binds.read'});const env=config();
  const url=new URL(req.url,'http://localhost');
  const body=req.method==='POST'?(typeof req.body==='string'?JSON.parse(req.body):req.body??{}):{};
  if(req.method==='GET'&&url.searchParams.get('action')==='shared')return send(200,await sharedPage(env,url));
  if(req.method==='POST'&&body.action==='shared-save')return send(200,await saveShared(env,actor,body));
  if(req.method==='GET'&&url.searchParams.get('action')==='knowledge')return send(200,await knowledgeSnapshot(env,actor));
  if(req.method==='POST'&&body.action==='knowledge-save')return send(200,await saveKnowledge(env,actor,body));
  if(req.method==='POST'&&body.action==='knowledge-delete')return send(200,await deleteKnowledge(env,actor,body));
  if(req.method==='GET'&&url.searchParams.get('action')==='users') {
   if(!can(actor.access,'binds.manage'))throw fail('Нет права управления биндами сотрудников',403);
   const search=(url.searchParams.get('search')??'').slice(0,120);
   // The existing RPC searches on the server. Only identity fields are returned to this UI.
   const data=await db(env,'rpc/supportos_rbac_list_users',{search_text:search,page_number:1});
   return send(200,{total:data.total,users:data.users.map(u=>({id:u.id,email:u.email,display_name:u.display_name}))});
  }
  if(req.method==='GET'&&url.searchParams.get('action')==='proposal-results') {
   const rows=await db(env,`supportos_bind_proposals?select=id,source_id,status,resolved_at,translations&author_id=eq.${actor.id}&status=in.(accepted,rejected)&order=resolved_at.desc&limit=50`);
   return send(200,rows.map(row=>({id:row.id,sourceId:row.source_id,status:row.status,resolvedAt:row.resolved_at,title:row.translations?.[0]?.title??'Предложение'})));
  }
  if(req.method==='GET'&&url.searchParams.get('action')==='quality-signals') {
   if(!can(actor.access,'knowledge.write'))throw fail('Нет доступа к качеству',403);
   const [feedback,gaps]=await Promise.all([db(env,'supportos_bind_feedback?select=bind_id,kind,updated_at&order=updated_at.desc&limit=100'),db(env,'supportos_knowledge_gaps?select=id,topic,project_id,created_at&order=created_at.desc&limit=100')]);
   return send(200,{feedback,gaps});
  }
  if(req.method==='GET'&&url.searchParams.get('action')==='my-feedback')return send(200,await db(env,`supportos_bind_feedback?select=bind_id,kind&user_id=eq.${actor.id}&limit=1000`));
  if(req.method==='POST'&&['feedback','gap'].includes(body.action)) {
   let payload;
   if(body.action==='gap') {
    const topic=safeKnowledgeTopic(body.topic);
    if(!topic)throw fail('Укажите короткую общую тему без персональных данных, номеров, ссылок и реквизитов');
    if(body.projectId!=null&&(typeof body.projectId!=='string'||! /^[a-z0-9_-]{1,100}$/i.test(body.projectId)))throw fail('Некорректный проект');
    payload={topic,projectId:body.projectId??null};
   } else {
    if(typeof body.bindId!=='string'||body.bindId.length>200||!['helpful','outdated'].includes(body.kind))throw fail('Некорректная отметка');
    payload={bindId:body.bindId,kind:body.kind};
   }
   return send(200,await db(env,'rpc/supportos_knowledge_signal',{actor:actor.id,operation:body.action,payload}));
  }
  const branchAction=req.method==='GET'?({branches:'list',history:'history',proposals:'proposals'}[url.searchParams.get('action')]):(['share','revoke','decline','choose','propose','accept','reject','withdraw'].includes(body.action)?body.action:null);
  if(branchAction){
   const payload=req.method==='GET'?{sourceId:url.searchParams.get('source_id')}:{sourceId:body.sourceId,email:body.email,shareId:body.shareId,proposalId:body.proposalId,branch:body.branch,expected:body.expected};
   if(JSON.stringify(payload).length>2000)throw fail('Слишком длинный запрос');
   const response=await fetch(`${env.SUPABASE_URL.replace(/\/$/,'')}/rest/v1/rpc/supportos_bind_branch_action`,{
    method:'POST',headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,'Content-Type':'application/json'},
    body:JSON.stringify({actor:actor.id,operation:branchAction,payload}),signal:AbortSignal.timeout(15000)
   });
   const result=await response.json();
   if(!response.ok)throw fail(['42501','40001','22023'].includes(result.code)?result.message:'Не удалось выполнить действие с веткой',result.code==='42501'?403:result.code==='40001'?409:400);
   return send(200,result);
  }
  const target=body.userId??url.searchParams.get('user_id')??actor.id;
  if(typeof target!=='string'||! /^[0-9a-f-]{36}$/i.test(target))throw fail('Некорректный пользователь');
  if(target!==actor.id&&!can(actor.access,'binds.manage'))throw fail('Нет права управления биндами сотрудников',403);
  if(req.method==='GET')return send(200,{rows:await allRows(env,`supportos_binds?select=*&owner_id=eq.${target}&order=id`)});
  if(!['save','reset'].includes(body.action)||typeof body.sourceId!=='string'||body.sourceId.length>200)throw fail('Некорректное действие');
  const response=await fetch(`${env.SUPABASE_URL.replace(/\/$/,'')}/rest/v1/rpc/supportos_personal_bind_change`,{
   method:'POST',headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,'Content-Type':'application/json'},
   body:JSON.stringify({actor:actor.id,target,source_id:body.sourceId,operation:body.action,payload:{expected:body.expected??null,translations:body.translations,tags:body.tags}}),signal:AbortSignal.timeout(15000)
  });
  const result=await response.json();
  if(!response.ok)throw fail(['42501','40001','22023'].includes(result.code)?result.message:'Не удалось сохранить личную версию',result.code==='42501'?403:result.code==='40001'?409:400);
  return send(200,result);
 }catch(error){return send(error.status??500,{code:error.code,error:error.status?error.message:'Не удалось загрузить бинды'});}
}
