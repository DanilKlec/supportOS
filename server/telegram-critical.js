import { randomBytes, randomUUID } from 'node:crypto';
import { can } from '../shared/access.js';
import { config, db } from './agent-monitor/_server.js';
import { digest, telegram } from './telegram-2fa.js';
import { securityMetadata } from './security-metadata.js';

const fail=(message,status=400,code)=>Object.assign(new Error(message),{status,code});
const uuid=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const token=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{43}$/.test(value);
const labels={
 'sessions.revoke_others':'Завершить все остальные сессии',
 'telegram.unlink':'Отключить текущую привязку Telegram',
 'telegram.change':'Сменить привязку Telegram через существующую проверку',
 'user.update':'Изменить роли / доступ сотрудника',
 'user.create':'Создать сотрудника и назначить роли',
 'role.save':'Сохранить роль и её разрешения',
 'role.delete':'Удалить роль',
};
function checked(result) {
 if(!result?.error)return result;
 const errors={forbidden:['Нет права выполнить это действие',403],invalid:['Подтверждение не соответствует действию или сессии',409],
  expired:['Подтверждение истекло. Создайте новый запрос.',410],processed:['Подтверждение уже использовано',409],
  not_approved:['Сначала подтвердите действие в Telegram',428],rate_limit:['Слишком много запросов. Повторите позже.',429]};
 const [message,status]=errors[result.error]??['Не удалось выполнить действие',503];
 throw fail(message,status,`critical_${result.error}`);
}
export function criticalSpec(actor,action,payload) {
 if(!actor.sessionId)throw fail('Сессия недействительна. Войдите снова.',401);
 if(!Object.hasOwn(labels,action)||!payload||typeof payload!=='object'||Array.isArray(payload)||Buffer.byteLength(JSON.stringify(payload))>8192)throw fail('Некорректное критичное действие');
 let target=actor.id;
 if(['user.update','user.create'].includes(action)) {
  if(!can(actor.access,'users.manage'))throw fail('Нет права управления пользователями',403);
  if(action==='user.update') {
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
 return {action,payload,target};
}
export async function criticalAction(req,actor,body,env=process.env) {
 env=config(env,['TELEGRAM_BOT_TOKEN','TELEGRAM_WEBHOOK_SECRET']);
 if(!actor.sessionId)throw fail('Сессия недействительна. Войдите снова.',401);
 if(['status','cancel'].includes(body.operation)) {
  if(!uuid.test(body.id??''))throw fail('Некорректное подтверждение');
  const state=checked(await db(env,'rpc/supportos_critical_state',{actor:actor.id,sid:actor.sessionId,request_id:body.id,cancel:body.operation==='cancel'}));
  return {id:state.id,status:state.status,expiresAt:state.expiresAt};
 }
 if(body.operation!=='begin')throw fail('Неизвестное действие');
 const spec=criticalSpec(actor,body.action,body.payload);
 const callbackToken=randomBytes(32).toString('base64url'),permit=randomBytes(32).toString('base64url');
 const metadata=securityMetadata(req,env);
 const state=checked(await db(env,'rpc/supportos_critical_begin',{
  actor:actor.id,sid:actor.sessionId,operation:spec.action,payload:spec.payload,request_id:randomUUID(),
  callback_digest:digest(callbackToken),permit_digest:digest(permit),ip_digest:metadata.ipHash,agent:metadata.agent,
 }));
 const description=body.action==='user.update'&&body.payload.status==='disabled'?'Отключить аккаунт сотрудника и сохранить указанные роли':labels[body.action];
 // Only allowlisted summaries go to Telegram, never the payload (passwords/keys).
 const roles=Array.isArray(body.payload.roles)?body.payload.roles.filter(r=>typeof r==='string'&&/^[a-z][a-z0-9_]{1,39}$/.test(r)).join(', '):null;
 const permissions=Array.isArray(body.payload.permissions)?body.payload.permissions.filter(p=>typeof p==='string'&&/^[a-z.]{1,60}$/.test(p)).join(', '):null;
 try {
  await telegram(env,'sendMessage',{chat_id:state.telegramId,text:`🔐 Критичное действие в SupportOS\n\n${description}\nЦель: ${spec.target}${roles!==null?`\nРоли: ${roles||'нет'}`:''}${permissions!==null?`\nРазрешения: ${permissions||'нет'}`:''}\n\nПодтверждайте только действие, которое начали сами. Срок — 5 минут. После подтверждения вернитесь на сайт.`,reply_markup:{inline_keyboard:[
   [{text:'Подтвердить действие',callback_data:`critical_approve:${callbackToken}`}],
   [{text:'Отклонить',callback_data:`critical_reject:${callbackToken}`}],
  ]}});
 } catch(error) {
  await db(env,'rpc/supportos_critical_state',{actor:actor.id,sid:actor.sessionId,request_id:state.id,cancel:true});
  throw error;
 }
 return {id:state.id,status:state.status,expiresAt:state.expiresAt,token:permit};
}
export async function executeCritical(actor,action,payload,proof,env=process.env) {
 const spec=criticalSpec(actor,action,payload);
 if(!proof)throw fail('Это действие нужно подтвердить в Telegram',428,'critical_confirmation_required');
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
export async function criticalCallback(callback,env) {
 if(callback.message?.chat?.type!=='private'||callback.message.chat.id!==callback.from?.id||callback.from?.is_bot||!Number.isSafeInteger(callback.from?.id)||callback.from.id<=0)return false;
 const match=/^critical_(approve|reject):([A-Za-z0-9_-]{43})$/.exec(callback.data??'');
 if(!match)return false;
 const result=await db(env,'rpc/supportos_critical_decide',{digest:digest(match[2]),tg:callback.from.id,decision:match[1]==='approve'?'approved':'rejected'});
 const text=result.error?'Запрос недоступен, истёк или уже обработан.':result.status==='approved'?'Действие подтверждено. Вернитесь в SupportOS.':'Действие отклонено.';
 await telegram(env,'answerCallbackQuery',{callback_query_id:callback.id,text});
 return true;
}
