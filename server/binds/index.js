import {requireUser} from '../_auth.js';
import {can} from '../../shared/access.js';
import {config,db,allRows} from '../agent-monitor/_server.js';
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
export default async function handler(req,res) {
 res.setHeader('Cache-Control','private, no-store');res.setHeader('Content-Type','application/json; charset=utf-8');
 const send=(status,value)=>{res.statusCode=status;res.end(JSON.stringify(value));};
 try {
  if(!['GET','POST'].includes(req.method))return send(405,{error:'Method not allowed'});
  if(req.method==='POST'&&(!req.headers.origin||new URL(req.headers.origin).host!==req.headers.host))throw fail('Invalid origin',403);
  const actor=await requireUser(req,{permission:'binds.read'});const env=config();
  const url=new URL(req.url,'http://localhost');
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
  const body=req.method==='POST'?(typeof req.body==='string'?JSON.parse(req.body):req.body??{}):{};
  const branchAction=req.method==='GET'?({branches:'list',history:'history',proposals:'proposals'}[url.searchParams.get('action')]):(['share','revoke','choose','propose','accept','reject','withdraw'].includes(body.action)?body.action:null);
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
 }catch(error){return send(error.status??500,{error:error.status?error.message:'Не удалось загрузить бинды'});}
}
