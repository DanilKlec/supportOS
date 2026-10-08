import {createClient} from '@supabase/supabase-js';
import {requireUser} from '../_auth.js';
import {can} from '../../shared/access.js';
import {changeAccess} from '../_rbac.js';
import {config,db,allRows} from '../agent-monitor/_server.js';
import {displayIdentity} from '../../shared/login-identity.js';
import {criticalAction,executeCritical} from '../telegram-critical.js';
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
export function adminClient(env=process.env) {
 const resolved=config(env);
 return createClient(resolved.SUPABASE_URL,resolved.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}}).auth.admin;
}
async function catalog(env){
 const [roles,permissions,links]=await Promise.all([allRows(env,'supportos_roles?select=*&order=name'),allRows(env,'supportos_permissions?select=*&order=id'),allRows(env,'supportos_role_permissions?select=*&order=role_id,permission_id')]);
 return {roles:roles.map(role=>({...role,permissions:links.filter(link=>link.role_id===role.id).map(link=>link.permission_id)})),permissions};
}
export default async function handler(req,res) {
 res.setHeader('Cache-Control','private, no-store');res.setHeader('Content-Type','application/json; charset=utf-8');
 const send=(status,data)=>{res.statusCode=status;res.end(JSON.stringify(data));};
 try {
  if(!['GET','POST'].includes(req.method)) return send(405,{error:'Method not allowed'});
  if(req.method==='POST'&&(!req.headers.origin||new URL(req.headers.origin).host!==req.headers.host)) throw fail('Invalid origin',403);
  const url=new URL(req.url,'http://localhost');const action=url.searchParams.get('action')??'users';
  const actor=await requireUser(req,{permission:null});
  if(req.method==='GET'&&action==='me')return send(200,{id:actor.id,access:actor.access});
  const env=config();
  if(action==='critical') {
   if(req.method!=='POST')throw fail('Используйте POST',405);
   return send(200,await criticalAction(req,actor,typeof req.body==='string'?JSON.parse(req.body):req.body??{},env));
  }
  if(['revoke-other-sessions','telegram-unlink','telegram-change'].includes(action)) {
   if(req.method!=='POST')throw fail('Используйте POST',405);
   const body=typeof req.body==='string'?JSON.parse(req.body):req.body??{};
   const operation=action==='revoke-other-sessions'?'sessions.revoke_others':action==='telegram-unlink'?'telegram.unlink':'telegram.change';
   await executeCritical(actor,operation,{},body.confirmation,env);
   if(operation==='sessions.revoke_others') {
    // Never use the default global scope: the verified current session must survive.
    const {error}=await adminClient(env).signOut(req.headers.authorization.slice(7),'others');
    if(error)throw fail('Не удалось завершить другие сессии. Создайте новое подтверждение и повторите попытку.',503);
    const result=await db(env,'rpc/supportos_critical_sessions_completed',{actor:actor.id,sid:actor.sessionId,request_id:body.confirmation.id});
    if(!result?.ok)throw fail('Не удалось подтвердить завершение всех других сессий. Обновите список.',503);
   }
   return send(200,{ok:true});
  }
  if(req.method==='GET'&&action==='login-history') {
   const target=url.searchParams.get('target')??actor.id;
   if(!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(target))throw fail('Некорректный пользователь');
   if(target!==actor.id&&!can(actor.access,'users.manage')||target===actor.id&&!can(actor.access,'work')&&!can(actor.access,'users.manage'))throw fail('Нет доступа к истории входов',403);
   if(!actor.sessionId)throw fail('Сессия недействительна. Войдите снова.',401);
   const before=url.searchParams.get('before');
   if(before!==null&&(!/^[1-9][0-9]{0,18}$/.test(before)||BigInt(before)>9223372036854775807n))throw fail('Некорректный курсор');
   const result=await db(env,'rpc/supportos_login_history',{actor:actor.id,actor_session:actor.sessionId,target,before_id:before??null});
   if(result?.error==='invalid_session')throw fail('Сессия недействительна. Войдите снова.',401);
   if(result?.error==='forbidden')throw fail('Нет доступа к истории входов',403);
   if(!Array.isArray(result?.events))throw fail('Не удалось загрузить историю входов',502);
   const optionalText=value=>typeof value==='string'?value:null;
   return send(200,{events:result.events.map(event=>({
    id:String(event.id),user_id:target,session_id:optionalText(event.session_id),event_type:event.event_type,
    created_at:optionalText(event.created_at),ip_hash:typeof event.ip_hash==='string'&&/^[a-f0-9]{64}$/.test(event.ip_hash)?event.ip_hash:null,
    browser:optionalText(event.browser),os:optionalText(event.os),telegram_result:optionalText(event.telegram_result),
   })),nextCursor:optionalText(result.nextCursor)});
  }
  if(req.method==='GET'&&action==='sessions') {
   if(!can(actor.access,'work'))throw fail('Недостаточно прав',403);
   if(!actor.sessionId)throw fail('Сессия недействительна. Войдите снова.',401);
   // Never accept subject/session overrides from query parameters or the body.
   const result=await db(env,'rpc/supportos_list_own_sessions',{subject:actor.id,sid:actor.sessionId});
   if(result?.error==='invalid_session')throw fail('Сессия недействительна. Войдите снова.',401);
   if(!Array.isArray(result?.sessions))throw fail('Не удалось загрузить активные сессии',502);
   const optionalText=value=>typeof value==='string'?value:null;
   return send(200,{sessions:result.sessions.map(session=>({
    id:session.id,
    created_at:optionalText(session.created_at),
    updated_at:optionalText(session.updated_at),
    refreshed_at:optionalText(session.refreshed_at),
    user_agent:typeof session.user_agent==='string'?session.user_agent.slice(0,512)||null:null,
    is_current:session.id===actor.sessionId,
   }))});
  }
  if(action==='telegram-links') {
   if(!can(actor.access,'users.manage'))throw fail('Недостаточно прав',403);
   if(req.method==='GET') {
    const requests=await db(env,'supportos_telegram_link_requests?select=id,user_id,telegram_id,telegram_username,verified_at&status=eq.verified&order=verified_at.asc&limit=100');
    const users=requests.length?await db(env,`supportos_users?select=id,email,display_name&id=in.(${requests.map(r=>r.user_id).join(',')})`):[];
    return send(200,{requests:requests.map(r=>({...r,user:users.find(u=>u.id===r.user_id)}))});
   }
   const data=typeof req.body==='string'?JSON.parse(req.body):req.body??{};
   if(!/^[a-f0-9-]{36}$/i.test(data.id??'')||typeof data.approve!=='boolean')throw fail('Некорректная заявка');
   return send(200,{ok:await db(env,'rpc/supportos_tg_link_review',{actor:actor.id,actor_session:actor.sessionId,request_id:data.id,approve:data.approve})});
  }
  if(req.method==='GET') {
   if(action==='users'&&url.searchParams.get('purpose')==='share') {
    if(!can(actor.access,'binds.read'))throw fail('Нет доступа к биндам',403);
    const page=Number(url.searchParams.get('page')??1);if(!Number.isInteger(page)||page<1||page>10000)throw fail('Некорректная страница');
    const search=(url.searchParams.get('search')??'').trim().slice(0,120).replace(/[^\p{L}\p{N}@._ -]/gu,'');
    const pattern=encodeURIComponent(`"*${search.replace(/[_]/g,'\\_')}*"`);
    const rows=await db(env,`supportos_users?select=id,display_name,email&status=eq.active&id=neq.${actor.id}&order=display_name.asc,id.asc&limit=51&offset=${(page-1)*50}${search?`&or=(display_name.ilike.${pattern},email.ilike.${pattern})`:''}`);
    return send(200,{users:rows.slice(0,50),hasMore:rows.length>50});
   }
   if(!can(actor.access,'users.manage')&&!can(actor.access,'roles.manage'))throw fail('Недостаточно прав',403);
   if(action==='catalog')return send(200,await catalog(env));
    if(action==='audit'){
     const target=url.searchParams.get('target');if(target&&!/^[a-zA-Z0-9_-]{1,100}$/.test(target))throw fail('Некорректный сотрудник');
    const before=url.searchParams.get('before');if(before&&!/^\d{1,18}$/.test(before))throw fail('Некорректный курсор');
     const rows=await db(env,`supportos_access_audit?select=*&order=id.desc&limit=50${can(actor.access,'binds.manage')?'':'&action=not.like.bind.*'}${before?`&id=lt.${before}`:''}${target?`&target_id=eq.${target}`:''}`);
    return send(200,{rows,hasMore:rows.length===50});
   }
   if(action!=='users'||!can(actor.access,'users.manage'))throw fail('Недостаточно прав',403);
   const page=Number(url.searchParams.get('page')??1);if(!Number.isInteger(page)||page<1||page>10000)throw fail('Некорректная страница');
    const status=url.searchParams.get('status')??'',role=url.searchParams.get('role')??'';
    if(!['','active','pending','disabled'].includes(status)||role&&!/^[a-z][a-z0-9_]{1,39}$/.test(role))throw fail('Некорректный фильтр');
    const result=await db(env,'rpc/supportos_rbac_list_users',{search_text:(url.searchParams.get('search')??'').slice(0,120),page_number:page,status_filter:status,role_filter:role});
    if(env.TELEGRAM_BOT_TOKEN && result.users?.length){
     const ids=result.users.map(user=>user.id).filter(id=>/^[a-f0-9-]{36}$/i.test(id));
     const identities=ids.length?await db(env,`supportos_telegram_registration?select=id,telegram_id,telegram_username,verified_at&id=in.(${ids.join(',')})&completed_at=not.is.null`):[];
     result.users=result.users.map(user=>({...user,email:displayIdentity(user.email),telegram:identities.find(identity=>identity.id===user.id)??null}));
    }
    return send(200,result);
  }
  const body=typeof req.body==='string'?JSON.parse(req.body):req.body??{};
  if(body.action==='create'){
   if(!can(actor.access,'users.manage'))throw fail('Нет права создавать пользователей',403);
   if(typeof body.email!=='string'||body.email.length>320||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())||typeof body.password!=='string'||body.password.length<12||body.password.length>128)throw fail('Укажите почту и пароль длиной от 12 до 128 символов');
   if(!Array.isArray(body.roles)||!body.roles.length||body.roles.length>30||body.roles.some(r=>typeof r!=='string'))throw fail('Выберите роли');
   const data=await catalog(env);const owner=actor.access.roles.some(r=>r.id==='creator');
   if(body.roles.some(id=>{const role=data.roles.find(r=>r.id===id);return !role||(!owner&&(id==='creator'||role.permissions.some(p=>!actor.access.permissions.includes(p))));}))throw fail('Нельзя назначить эти роли',403);
   await executeCritical(actor,'user.create',body,body.confirmation,env);
   // Non-secret, server-controlled reference: the identity-sync transaction
   // writes user.create audit before Auth commits (also when role setup fails).
   const result=await adminClient().createUser({email:body.email.trim(),password:body.password,email_confirm:true,app_metadata:{supportos_creation_request:body.confirmation.id}});
   if(result.error)throw fail('Не удалось создать аккаунт. Проверьте почту и требования к паролю');
   const id=result.data.user.id;
   try{await changeAccess(actor.id,'user.update',{id,roles:body.roles,status:'active',display_name:typeof body.display_name==='string'?body.display_name.slice(0,120):'',version:1});}
   catch{ return send(201,{id,warning:'Аккаунт создан без доступа. Найдите его в списке и назначьте роли.'});}
   return send(201,{id});
  }
  if(!['user.update','role.save','role.delete'].includes(body.action))throw fail('Неизвестное действие');
  return send(200,await executeCritical(actor,body.action,body.payload,body.confirmation,env));
 }catch(error){return send(error.status??500,{error:error.status?error.message:'Ошибка управления доступами',code:error.code});}
}
