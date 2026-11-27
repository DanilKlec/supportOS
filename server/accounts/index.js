import {createClient} from '@supabase/supabase-js';
import {requireUser} from '../_auth.js';
import {can} from '../../shared/access.js';
import {changeAccess,loadAccess} from '../_rbac.js';
import {chatCapabilities} from '../../shared/chatwoot-access.js';
import {config as chatwootConfig,normalizeStaffChatwoot,provisionStaffChatwoot} from '../chatwoot/index.js';
import {config,db,allRows} from '../supabase-rest.js';
import {displayIdentity} from '../../shared/login-identity.js';
import {criticalAction,criticalSpec,executeCritical} from '../critical-confirmation.js';
import {randomUUID} from 'node:crypto';
import {securityMetadata} from '../security-metadata.js';
import {getInvitationSettings,lastCustomInvitation,loadInvitationSettings,saveInvitationSettings,sendCustomInvitation} from './invitation.js';
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
export function adminClient(env=process.env) {
 const resolved=config(env);
 return createClient(resolved.SUPABASE_URL,resolved.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}}).auth.admin;
}
async function catalog(env){
 const [roles,permissions,links]=await Promise.all([allRows(env,'supportos_roles?select=*&order=name'),allRows(env,'supportos_permissions?select=*&order=id'),allRows(env,'supportos_role_permissions?select=*&order=role_id,permission_id')]);
 return {roles:roles.map(role=>({...role,permissions:links.filter(link=>link.role_id===role.id).map(link=>link.permission_id)})),permissions};
}

function inviteRedirect(env) {
 const base = new URL(env.SUPPORTOS_APP_URL || 'https://support-os-psi.vercel.app');
 if (base.protocol !== 'https:' && !(env.NODE_ENV !== 'production' && base.hostname === 'localhost'))
  throw fail('Укажите HTTPS-адрес SupportOS для приглашений', 503);
 return new URL('/login?invite=1', base).href;
}

async function pendingInvitation(env, actor, id) {
 if (!can(actor.access, 'users.manage') || id === actor.id) throw fail('Недостаточно прав', 403);
 if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(id ?? '')) throw fail('Некорректный пользователь');
 const [access, result] = await Promise.all([loadAccess(id, env), adminClient(env).getUserById(id)]);
 if (access.roles.some(role => role.id === 'creator') ||
   (!actor.access.roles.some(role => role.id === 'creator') && access.permissions.some(permission => !actor.access.permissions.includes(permission))))
  throw fail('Недостаточно прав', 403);
 if (result.error || !result.data.user) throw fail('Не удалось проверить статус приглашения', 502);
 return { access, user: result.data.user, pending: result.data.user.app_metadata?.supportos_invitation === true && !result.data.user.email_confirmed_at };
}

async function sendStaffInvitation(env, actor, user, name, redirectTo) {
 const admin = adminClient(env);
 const setup = user.app_metadata?.supportos_chatwoot_pending;
 let warning;
 if (setup) {
  const cfg = chatwootConfig(env);
  if (!cfg || !chatCapabilities(actor.access).manageProjects)
   return { invited: false, warning: 'Сотрудник создан. Для настройки Chatwoot и повторной отправки приглашения нужен администратор чатов.' };
  try {
   const result = await provisionStaffChatwoot(env, cfg, { actorId: actor.id, userId: user.id, email: user.email, name, setup });
   if (!result.personalConnected) warning = 'Агент Chatwoot настроен. Для подписи своими данными сотрудник может подключить личный профиль в разделе «Чаты».';
   const { error } = await admin.updateUserById(user.id, { app_metadata: { supportos_chatwoot_pending: null } });
   if (error) throw error;
  } catch {
   return { invited: false, warning: 'Сотрудник создан. Настройка Chatwoot не завершилась. Повторите отправку из карточки сотрудника.' };
  }
 }
 try {
  const settings=await loadInvitationSettings(env);
  if(settings.senderId) {
   await sendCustomInvitation(env,settings,admin,user,name,redirectTo);
   return {invited:true,warning};
  }
 } catch(error) {
  return {invited:false,warning:error.status&&error.status!==502?error.message:'Не удалось отправить приглашение. Проверьте подключение почтового ящика и повторите отправку из карточки сотрудника.'};
 }
 const { data, error } = await admin.inviteUserByEmail(user.email, { redirectTo });
 if (error || data?.user?.id !== user.id) {
  const limited = ['over_email_send_rate_limit', 'over_request_rate_limit'].includes(error?.code);
  return { invited: false, warning: limited
   ? 'Достигнут лимит отправки писем. Повторите приглашение позже из карточки сотрудника.'
   : 'Сотрудник создан. Supabase не подтвердил отправку письма. Проверьте SMTP и повторите приглашение из карточки сотрудника.' };
 }
 return { invited: true, warning };
}
export default async function handler(req,res) {
 res.setHeader('Cache-Control','private, no-store');res.setHeader('Content-Type','application/json; charset=utf-8');
 const send=(status,data)=>{res.statusCode=status;res.end(JSON.stringify(data));};
 try {
  if(!['GET','POST'].includes(req.method)) return send(405,{error:'Method not allowed'});
  if(req.method==='POST'&&(!req.headers.origin||new URL(req.headers.origin).host!==req.headers.host)) throw fail('Invalid origin',403);
  const url=new URL(req.url,'http://localhost');const action=url.searchParams.get('action')??'users';
  const actor=await requireUser(req,{permission:null});
  if(req.method==='GET'&&action==='me') {
   const metadata=securityMetadata(req,process.env);
   await db(config(),'rpc/supportos_record_mfa_login',{subject:actor.id,sid:actor.sessionId,ip_digest:metadata.ipHash,agent:metadata.agent});
   return send(200,{id:actor.id,access:actor.access,mfaEnabled:actor.mfaEnabled===true});
  }
  const env=config();
  if(action==='invitation-template') {
   if(!can(actor.access,'users.manage'))throw fail('Настройки приглашений доступны администратору.',403);
   if(req.method==='GET')return send(200,await getInvitationSettings(env));
   return send(200,await saveInvitationSettings(env,typeof req.body==='string'?JSON.parse(req.body):req.body??{}));
  }
  if(action==='critical') {
   if(req.method!=='POST')throw fail('Используйте POST',405);
   return send(200,await criticalAction(req,actor,typeof req.body==='string'?JSON.parse(req.body):req.body??{},env));
  }
  if(action==='revoke-other-sessions') {
   if(req.method!=='POST')throw fail('Используйте POST',405);
   const body=typeof req.body==='string'?JSON.parse(req.body):req.body??{};
   const operation='sessions.revoke_others';
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
  if(req.method==='GET') {
   if(action==='invitation') {
    const invitation=await pendingInvitation(env,actor,url.searchParams.get('target'));
    const customSentAt=invitation.pending?await lastCustomInvitation(env,invitation.user.id):null;
    const sentAt=invitation.pending?[customSentAt,invitation.user.invited_at].filter(Boolean).sort((a,b)=>Date.parse(b)-Date.parse(a))[0]??null:null;
    return send(200,{pending:invitation.pending,canResend:invitation.pending&&invitation.access.status==='active',sentAt});
   }
   if(action==='users'&&url.searchParams.get('purpose')==='share') {
    if(!can(actor.access,'binds.read'))throw fail('Нет доступа к биндам',403);
    const page=Number(url.searchParams.get('page')??1);if(!Number.isInteger(page)||page<1||page>10000)throw fail('Некорректная страница');
    const search=(url.searchParams.get('search')??'').trim().slice(0,120).replace(/[^\p{L}\p{N}@._ -]/gu,'');
    const pattern=encodeURIComponent(`"*${search.replace(/[_]/g,'\\_')}*"`);
    const rows=await db(env,`supportos_users?select=id,display_name,email&status=eq.active&id=neq.${actor.id}&order=display_name.asc,id.asc&limit=51&offset=${(page-1)*50}${search?`&or=(display_name.ilike.${pattern},email.ilike.${pattern})`:''}`);
    return send(200,{users:rows.slice(0,50),hasMore:rows.length>50});
   }
   if(!can(actor.access,'users.manage')&&!can(actor.access,'roles.manage'))throw fail('Недостаточно прав',403);
   if(action==='catalog'){
    const {roles,permissions}=await catalog(env);
    return send(200,{
     roles:roles.map(role=>({...role,permissions:role.permissions.filter(id=>id!=='monitor.write')})),
     permissions:permissions.filter(({id})=>id!=='monitor.write').map(permission=>permission.id==='monitor.read'
      ? {...permission,name:'Наблюдение за чатами',description:'Активные диалоги и личные подсказки агентам в Chatwoot'}
      : permission),
    });
   }
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
    if(result.users) result.users=result.users.map(user=>({...user,email:displayIdentity(user.email)}));
    return send(200,result);
  }
  const body=typeof req.body==='string'?JSON.parse(req.body):req.body??{};
  if(body.action==='user.invite.resend') {
   if(body.confirmed!==true)throw fail('Подтвердите отправку приглашения',400);
   const redirectTo=inviteRedirect(env);
   const invitation=await pendingInvitation(env,actor,body.id);
   if(!invitation.pending||invitation.access.status!=='active')throw fail('Повторная отправка доступна для активных сотрудников, которые ещё не подтвердили почту',409);
   if(invitation.user.app_metadata?.supportos_chatwoot_pending&&!invitation.access.permissions.includes('work')) throw fail('Для подключения Chatwoot сотруднику нужен доступ к чатам',409);
   return send(200,await sendStaffInvitation(env,actor,invitation.user,invitation.access.display_name??'',redirectTo));
  }
  if(body.action==='create'){
   if(!can(actor.access,'users.manage'))throw fail('Нет права создавать пользователей',403);
   if(typeof body.email!=='string'||body.email.length>254||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim()))throw fail('Укажите рабочую почту');
   const invited=body.delivery==='invite';
   if(!invited&&(typeof body.password!=='string'||body.password.length<12||body.password.length>128))throw fail('Укажите пароль длиной от 12 до 128 символов');
   const email=invited?body.email.trim().toLowerCase():body.email.trim();
   const name=typeof body.display_name==='string'?body.display_name.trim().slice(0,120):'';
   const redirectTo=invited?inviteRedirect(env):null;
   const setup=invited?normalizeStaffChatwoot(body.chatwoot):null;
   if(!Array.isArray(body.roles)||!body.roles.length||body.roles.length>30||body.roles.some(r=>typeof r!=='string'))throw fail('Выберите роли');
   const data=await catalog(env);const owner=actor.access.roles.some(r=>r.id==='creator');
   if(body.roles.some(id=>{const role=data.roles.find(r=>r.id===id);return !role||(!owner&&(id==='creator'||role.permissions.some(p=>!actor.access.permissions.includes(p))));}))throw fail('Нельзя назначить эти роли',403);
   if(setup) {
    if(!chatCapabilities(actor.access).manageProjects)throw fail('Настройка Chatwoot доступна администраторам чатов',403);
    if(!data.roles.some(role=>body.roles.includes(role.id)&&role.permissions.includes('work')))throw fail('Выберите роль с доступом к чатам');
    if(!chatwootConfig(env))throw fail('Подключите Chatwoot перед созданием агента',503);
   }
   if(body.confirmed!==true)throw fail('Подтвердите создание аккаунта во всплывающем окне',400);
   const requestId=randomUUID(),metadata=securityMetadata(req,env);
   const prepared=await db(env,'rpc/supportos_prepare_account_action',{actor:actor.id,sid:actor.sessionId,operation:'user.create',payload:criticalSpec(actor,'user.create',{...body,email,display_name:name}).payload,request_id:requestId,ip_digest:metadata.ipHash,agent:metadata.agent});
   if(!prepared?.ok)throw fail('Нет права создавать аккаунт с этими ролями',403);
   // Non-secret, server-controlled reference: the identity-sync transaction
   // writes user.create audit before Auth commits (also when role setup fails).
   const appMetadata={supportos_creation_request:requestId,...(invited?{supportos_invitation:true,...(setup?{supportos_chatwoot_pending:setup}:{})}:{})};
   const result=await adminClient(env).createUser({email,...(invited?{}:{password:body.password}),email_confirm:!invited,app_metadata:appMetadata});
   if(result.error||!result.data?.user?.id)throw fail(result.error?.code==='email_exists'?'Аккаунт с этой почтой уже существует. Откройте его карточку.':'Не удалось создать аккаунт. Проверьте данные сотрудника');
   const id=result.data.user.id;
   try{await changeAccess(actor.id,'user.update',{id,roles:body.roles,status:'active',display_name:name,version:1});}
   catch{ return send(201,{id,warning:'Аккаунт создан без доступа. Найдите его в списке и назначьте роли.'});}
   return send(201,{id,...(invited?await sendStaffInvitation(env,actor,{id,email,app_metadata:appMetadata},name,redirectTo):{})});
  }
  if(['user.password','user.delete','user.mfa.reset','user.sessions.revoke'].includes(body.action)) {
   if(!can(actor.access,'users.manage'))throw fail('Нет права управления пользователями',403);
   if(body.action==='user.password'&&(typeof body.payload?.password!=='string'||body.payload.password.length<12||body.payload.password.length>128))throw fail('Пароль должен содержать от 12 до 128 символов');
   if(body.confirmed!==true)throw fail('Подтвердите действие во всплывающем окне',400);
   const requestId=randomUUID(),metadata=securityMetadata(req,env);
   const prepared=await db(env,'rpc/supportos_prepare_account_action',{actor:actor.id,sid:actor.sessionId,operation:body.action,payload:criticalSpec(actor,body.action,body.payload).payload,request_id:requestId,ip_digest:metadata.ipHash,agent:metadata.agent});
   if(!prepared?.ok)throw fail(prepared?.error==='conflict'?'Данные изменились. Обновите список':'Нет права выполнить это действие',prepared?.error==='conflict'?409:403);
   if(body.action==='user.mfa.reset') {
    const admin=adminClient(env);
    const {data,error}=await admin.mfa.listFactors({userId:body.payload.id});
    if(error||!Array.isArray(data?.factors))throw fail('Не удалось получить настройки 2FA. Сессии сотрудника завершены. Обновите карточку и повторите попытку.',502);
    for(const factor of data.factors) {
     const removed=await admin.mfa.deleteFactor({userId:body.payload.id,id:factor.id});
     if(removed.error)throw fail('Не удалось полностью отключить 2FA. Сессии сотрудника завершены. Обновите карточку и повторите попытку.',502);
    }
   } else if(body.action!=='user.sessions.revoke') {
    const admin=adminClient(env);
    const result=body.action==='user.password'
     ? await admin.updateUserById(body.payload.id,{password:body.payload.password})
     : await admin.deleteUser(body.payload.id);
    if(result.error)throw fail(body.action==='user.password'?'Не удалось изменить пароль. Проверьте требования к паролю, обновите список и повторите попытку. Сессии сотрудника завершены.':'Не удалось удалить аккаунт. Сессии сотрудника завершены. Обновите список и повторите попытку.',502);
   }
   const completed=await db(env,'rpc/supportos_account_action_completed',{actor:actor.id,sid:actor.sessionId,request_id:requestId});
   if(!completed?.ok&&['user.mfa.reset','user.sessions.revoke'].includes(body.action))throw fail('Не удалось подтвердить завершение действия. Обновите карточку и проверьте журнал перед повторной попыткой.',502);
   if(!completed?.ok)return send(200,{ok:true,warning:'Действие выполнено, но журнал не подтвердил завершение. Обновите список и проверьте историю.'});
   return send(200,{ok:true});
  }
  if(!['user.update','role.save','role.delete'].includes(body.action))throw fail('Неизвестное действие');
  if(body.confirmed!==true)throw fail('Подтвердите изменение доступов во всплывающем окне',400);
  const requestId=randomUUID(),metadata=securityMetadata(req,env);
  const prepared=await db(env,'rpc/supportos_prepare_account_action',{actor:actor.id,sid:actor.sessionId,operation:body.action,payload:criticalSpec(actor,body.action,body.payload).payload,request_id:requestId,ip_digest:metadata.ipHash,agent:metadata.agent});
  if(!prepared?.ok)throw fail(prepared?.error==='conflict'?'Данные изменились. Обновите список':prepared?.error==='invalid'?'Проверьте данные пользователя или роли':'Нет права изменять эти доступы',prepared?.error==='conflict'?409:prepared?.error==='invalid'?400:403);
  return send(200,prepared.result);
 }catch(error){return send(error.status??500,{error:error.status?error.message:'Ошибка управления доступами',code:error.code});}
}
