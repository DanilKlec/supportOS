import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { config, db } from './agent-monitor/_server.js';

export const digest = value => createHash('sha256').update(value).digest('hex');
const fail = (message, status=400, code) => Object.assign(new Error(message), {status,code});
export async function telegram(env,method,body) {
 let response;
 try { response=await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)}); }
 catch { throw fail('Telegram временно недоступен. Повторите попытку.',503); }
 const result=await response.json();
 if(!response.ok||!result.ok)throw fail('Не удалось отправить сообщение в Telegram. Проверьте, что бот не заблокирован.',503);
 return result.result;
}
export async function loginState(user,env=process.env) {
 return db(config(env),'rpc/supportos_tg_login_state',{subject:user.id,sid:user.sessionId});
}
export async function requireTelegram(user,env) {
 const state=await loginState(user,env);
 if(state.status==='invalid_session')throw fail('Сессия завершена. Войдите снова.',401);
 if(state.status!=='approved')throw fail('Telegram 2FA required',403,'telegram_2fa_required');
}
const safeState = ({status,id,expiresAt,resendAt,linkId}) => ({status,id,expiresAt,resendAt,linkId});
export async function twoFactorAction(req,user,action,body,env=process.env) {
 env=config(env,['TELEGRAM_BOT_TOKEN','TELEGRAM_BOT_USERNAME','TELEGRAM_WEBHOOK_SECRET']);
 if(action==='status')return safeState(await loginState(user,env));
 if(action==='cancel') {
  await db(env,'rpc/supportos_tg_login_cancel',{subject:user.id,sid:user.sessionId});
  return {status:'rejected'};
 }
 const token=randomBytes(32).toString('base64url');
 if(action==='link') {
  const state=await db(env,'rpc/supportos_tg_link_begin',{subject:user.id,sid:user.sessionId,request_id:randomUUID(),digest:digest(token)});
  if(state.error)throw fail('Слишком много запросов. Повторите позже.',429);
  return {...safeState(state),...(state.send?{telegramUrl:`https://t.me/${env.TELEGRAM_BOT_USERNAME}?start=link_${token}`}:{})};
 }
 if(action!=='begin')throw fail('Неизвестное действие');
 const agent=String(req.headers['user-agent']??'').slice(0,300);
 const browser=/Edg\//.test(agent)?'Edge':/Firefox\//.test(agent)?'Firefox':/Chrome\//.test(agent)?'Chrome':/Safari\//.test(agent)?'Safari':'Не определён';
 const os=/Android/.test(agent)?'Android':/iPhone|iPad/.test(agent)?'iOS':/Windows/.test(agent)?'Windows':/Macintosh/.test(agent)?'macOS':/Linux/.test(agent)?'Linux':'Не определена';
 const ip=String(env.VERCEL==='1'?req.headers['x-vercel-forwarded-for']??'unknown':req.socket?.remoteAddress??'unknown');
 const state=await db(env,'rpc/supportos_tg_login_begin',{subject:user.id,sid:user.sessionId,request_id:randomUUID(),digest:digest(token),agent,ip_digest:createHmac('sha256',env.TELEGRAM_WEBHOOK_SECRET).update(ip).digest('hex'),resend:body.resend===true});
 if(state.error)throw fail('Повторная отправка доступна через минуту. Лимит — 10 запросов в час.',429);
 if(state.send) {
  try { await telegram(env,'sendMessage',{chat_id:state.telegramId,text:`🔐 Вход в SupportOS\n\nОбнаружена попытка входа в ваш аккаунт.\nВремя: ${new Date().toISOString()} (UTC)\nБраузер: ${browser}\nОС: ${os}\nПодключение: веб-сайт SupportOS\n\nПодтверждайте только свой вход. Запрос действует 5 минут.`,reply_markup:{inline_keyboard:[[{text:'✅ Подтвердить вход',callback_data:`login_approve:${token}`}],[{text:'❌ Отклонить',callback_data:`login_reject:${token}`}]]}}); }
  catch(error) {
   // Invalidate undelivered challenges; a later retry creates a fresh session.
   await db(env,'rpc/supportos_tg_login_cancel',{subject:user.id,sid:user.sessionId});
   throw error;
  }
 }
 return safeState(state);
}
export async function loginCallback(callback,env) {
 if(callback.message?.chat?.type!=='private'||callback.message.chat.id!==callback.from?.id||callback.from?.is_bot||!Number.isSafeInteger(callback.from?.id)||callback.from.id<=0)return false;
 const match=/^login_(approve|reject):([A-Za-z0-9_-]{43})$/.exec(callback.data??'');
 const link=/^link_confirm:([A-Za-z0-9_-]{43})$/.exec(callback.data??'');
 if(!match&&!link)return false;
 const result=match?await db(env,'rpc/supportos_tg_login_decide',{digest:digest(match[2]),tg:callback.from.id,decision:match[1]==='approve'?'approved':'rejected'}):await db(env,'rpc/supportos_tg_link_verify',{digest:digest(link[1]),tg:callback.from.id,username:callback.from.username??null});
 const text=result.error==='expired'?'Запрос на вход истёк.':result.error==='processed'?'Этот запрос уже обработан.':result.error?'Запрос недоступен для этого Telegram-аккаунта.':link?'Telegram подтверждён. Привязку проверит администратор SupportOS.':result.status==='approved'?'✅ Вход подтверждён. Вы можете вернуться в SupportOS.':'❌ Вход отклонён. Попытка входа заблокирована.';
 await telegram(env,'answerCallbackQuery',{callback_query_id:callback.id,text});
 await telegram(env,'sendMessage',{chat_id:callback.from.id,text});
 return true;
}
