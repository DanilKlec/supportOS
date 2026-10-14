import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { can } from '../shared/access.js';
import { config, db } from './agent-monitor/_server.js';
import { securityMetadata } from './security-metadata.js';

const fail=(message,status=400,code)=>Object.assign(new Error(message),{status,code});
const digest=value=>createHash('sha256').update(value).digest('hex');
const uuid=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const token=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{43}$/.test(value);
const labels={
 'sessions.revoke_others':'Завершить все остальные сессии',
 'user.update':'Изменить роли / доступ сотрудника',
 'user.create':'Создать сотрудника и назначить роли',
 'user.password':'Изменить пароль сотрудника',
 'user.delete':'Удалить аккаунт сотрудника',
 'user.mfa.reset':'Отключить 2FA сотрудника',
 'user.sessions.revoke':'Завершить все сессии сотрудника',
 'role.save':'Сохранить роль и её разрешения',
 'role.delete':'Удалить роль',
};
function checked(result) {
 if(!result?.error)return result;
 const errors={forbidden:['Нет права выполнить это действие',403],invalid:['Подтверждение не соответствует действию или сессии',409],
  expired:['Подтверждение истекло. Создайте новый запрос.',410],processed:['Подтверждение уже использовано',409],
  not_approved:['Сначала подтвердите действие кодом Google Authenticator',428],rate_limit:['Слишком много запросов. Повторите позже.',429],
  mfa_reused:['Этот код уже использован для действия. Дождитесь следующего кода.',409],mfa_stale:['Введите новый код Google Authenticator',428]};
 const [message,status]=errors[result.error]??['Не удалось выполнить действие',503];
 throw fail(message,status,`critical_${result.error}`);
}
export function criticalSpec(actor,action,payload) {
 if(!actor.sessionId)throw fail('Сессия недействительна. Войдите снова.',401);
 if(!Object.hasOwn(labels,action)||!payload||typeof payload!=='object'||Array.isArray(payload)||Buffer.byteLength(JSON.stringify(payload))>8192)throw fail('Некорректное критичное действие');
 let target=actor.id;
 if(['user.update','user.create','user.password','user.delete','user.mfa.reset','user.sessions.revoke'].includes(action)) {
  if(!can(actor.access,'users.manage'))throw fail('Нет права управления пользователями',403);
  if(action!=='user.create') {
   if(!uuid.test(payload.id??'')||payload.id===actor.id)throw fail('Некорректный сотрудник');
   target=payload.id;
  } else {
   if(typeof payload.email!=='string'||payload.email.length>320||!(/^[^\s@]+@[^\s@]+\.[^\s@]+$/).test(payload.email.trim()))throw fail('Некорректная почта');
   target=payload.email.trim().toLowerCase();
  }
 } else if(['role.save','role.delete'].includes(action)) {
  if(!can(actor.access,'roles.manage'))throw fail('Нет права управления ролями',403);
  if(typeof payload.id!=='string'||!(/^[a-z][a-z0-9_]{1,39}$/).test(payload.id)||payload.id==='creator')throw fail('Некорректная роль');
  target=payload.id;
 } else if(!can(actor.access,'work'))throw fail('Нет доступа',403);
 else if(Object.keys(payload).length)throw fail('Для этого действия нельзя указать другую сессию или пользователя');
 // Account creation credentials remain in the original transient Auth flow.
 if(action==='user.create')payload={email:payload.email,roles:payload.roles,display_name:payload.display_name??''};
 if(['user.password','user.delete','user.mfa.reset','user.sessions.revoke'].includes(action)) {
  if(!Number.isInteger(payload.version)||payload.version<1)throw fail('Обновите карточку сотрудника',409);
  if(action==='user.password') {
   const passwordDigest=typeof payload.password==='string'?digest(payload.password):payload.password_digest;
   if(!/^[a-f0-9]{64}$/.test(passwordDigest??''))throw fail('Некорректный пароль');
   payload={id:payload.id,version:payload.version,password_digest:passwordDigest};
  } else payload={id:payload.id,version:payload.version};
 }
 return {action,payload,target};
}
export async function criticalAction(req,actor,body,env=process.env) {
 env=config(env);
 if(!actor.sessionId)throw fail('Сессия недействительна. Войдите снова.',401);
 if(['status','cancel'].includes(body.operation)) {
  if(!uuid.test(body.id??''))throw fail('Некорректное подтверждение');
  const state=checked(await db(env,'rpc/supportos_critical_state',{actor:actor.id,sid:actor.sessionId,request_id:body.id,cancel:body.operation==='cancel'}));
  return {id:state.id,status:state.status,expiresAt:state.expiresAt};
 }
 if(body.operation!=='begin')throw fail('Неизвестное действие');
 const spec=criticalSpec(actor,body.action,body.payload);
 const permit=randomBytes(32).toString('base64url');
 const metadata=securityMetadata(req,env);
 if(actor.aal!=='aal2'||!actor.mfaVerifiedAt||Math.abs(Date.now()/1000-actor.mfaVerifiedAt)>60)throw fail('Введите новый код Google Authenticator',428,'critical_mfa_stale');
 const state=checked(await db(env,'rpc/supportos_mfa_critical_begin',{
  actor:actor.id,sid:actor.sessionId,operation:spec.action,payload:spec.payload,request_id:randomUUID(),
  verified_at:actor.mfaVerifiedAt,permit_digest:digest(permit),ip_digest:metadata.ipHash,agent:metadata.agent,
 }));
 return {id:state.id,status:state.status,expiresAt:state.expiresAt,token:permit};
}
export async function executeCritical(actor,action,payload,proof,env=process.env) {
 const spec=criticalSpec(actor,action,payload);
 if(!proof)throw fail('Это действие нужно подтвердить кодом Google Authenticator',428,'critical_confirmation_required');
 if(!uuid.test(proof.id??'')||!token(proof.token))throw fail('Некорректное подтверждение',409,'critical_invalid');
 env=config(env);
 const response=await fetch(`${env.SUPABASE_URL.replace(/\/$/,'')}/rest/v1/rpc/supportos_critical_execute`,{
  method:'POST',headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,'Content-Type':'application/json'},
  body:JSON.stringify({actor:actor.id,sid:actor.sessionId,operation:action,payload:spec.payload,request_id:proof.id,permit_digest:digest(proof.token)}),signal:AbortSignal.timeout(15000),
 });
 const result=await response.json();
 if(!response.ok)throw fail(result.message??'Ошибка изменения доступа',result.code==='42501'?403:result.code==='40001'?409:400);
 return checked(result);
}
