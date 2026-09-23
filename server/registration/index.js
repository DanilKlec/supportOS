import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { adminClient } from '../accounts/index.js';
import { config, db, equal } from '../agent-monitor/_server.js';
import { loginEmail, normalizeLogin } from '../../shared/login-identity.js';
import { requireIdentity } from '../_auth.js';
import { twoFactorAction, loginCallback, telegram as sendTelegram } from '../telegram-2fa.js';
import { passwordAction, passwordBot } from '../telegram-password.js';

const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const hash=value=>createHash('sha256').update(value).digest('hex');
const validToken=value=>typeof value==='string' && /^[A-Za-z0-9_-]{43}$/.test(value);
const messages={expired:'Ссылка истекла. Начните регистрацию заново.',not_verified:'Сначала подтвердите заявку в Telegram.',already_linked:'Эта заявка уже подтверждена другим Telegram-аккаунтом.',already_registered:'Этот логин или Telegram уже используется. Войдите в существующий аккаунт.',login_taken:'Этот логин занят. Выберите другой.',rate_limit:'Слишком много заявок. Попробуйте позже.'};
function checked(result) {
 if(result?.error) throw fail(messages[result.error] ?? 'Не удалось обработать заявку',result.error==='rate_limit'?429:409);
 return result;
}
async function telegram(env,method,body) {
 // Never log this URL: it contains a server credential.
 let response;
 try {response=await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});} catch {throw fail('Telegram временно недоступен',503);}
 const result=await response.json();
 if(!response.ok||!result.ok) throw fail('Telegram временно недоступен',503);
 return result.result;
}
async function webhook(body,env) {
 if(await passwordBot(body,env))return;
 const callback=body.callback_query;
 if(callback) {
  const id=callback.from?.id;
  if(callback.message?.chat?.type!=='private'||callback.message.chat.id!==id||callback.from?.is_bot||!Number.isSafeInteger(id)||id<=0) return;
  if(await loginCallback(callback,env))return;
  const match=/^confirm:([A-Za-z0-9_-]{43})$/.exec(callback.data ?? '');
  if(!match) return;
  const result=await db(env,'rpc/supportos_tg_confirm',{start_digest:hash(match[1]),tg_id:id,tg_username:callback.from.username ?? null});
  await telegram(env,'answerCallbackQuery',{callback_query_id:callback.id,text:result.error?'Не удалось подтвердить заявку':'Telegram подтверждён'});
  await telegram(env,'sendMessage',{chat_id:id,text:result.error?(messages[result.error]??'Заявка недоступна'):`Telegram подтверждён для логина ${result.login}. Вернитесь в ту же вкладку SupportOS и нажмите «Завершить регистрацию». Затем администратор проверит заявку и назначит роли.`});
  return;
 }
 const message=body.message;
 const id=message?.from?.id;
 if(message?.chat?.type!=='private'||message.chat.id!==id||message.from?.is_bot||!Number.isSafeInteger(id)||id<=0) return;
 const link=/^\/start(?:@\w+)? link_([A-Za-z0-9_-]{43})$/.exec(message.text??'');
 if(link) {
  const rows=await db(env,`supportos_telegram_link_requests?select=user_id&challenge_hash=eq.${hash(link[1])}&status=eq.pending&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&limit=1`);
  if(!rows[0]){await sendTelegram(env,'sendMessage',{chat_id:id,text:'Запрос привязки истёк. Вернитесь на сайт.'});return;}
  const users=await db(env,`supportos_users?select=email,display_name&id=eq.${rows[0].user_id}&limit=1`);
  await sendTelegram(env,'sendMessage',{chat_id:id,text:`Привязать Telegram к аккаунту SupportOS «${users[0]?.display_name||users[0]?.email||rows[0].user_id}»? Подтверждайте только свой аккаунт. После подтверждения привязку проверит администратор.`,reply_markup:{inline_keyboard:[[{text:'Подтвердить привязку',callback_data:`link_confirm:${link[1]}`}]]}});return;
 }
 const match=/^\/start(?:@\w+)? ([A-Za-z0-9_-]{43})$/.exec(message.text ?? '');
 if(!match) {
  if(/^\/(start|help)(?:@\w+)?$/.test(message.text ?? '')) await telegram(env,'sendMessage',{chat_id:id,text:'Для регистрации откройте SupportOS, выберите «Регистрация» и перейдите сюда по кнопке «Подтвердить через Telegram». Доступ и роли назначает администратор. Не отправляйте боту пароли.'});
  return;
 }
 const rows=await db(env,`supportos_telegram_registration?select=login,expires_at,completed_at&start_hash=eq.${hash(match[1])}&limit=1`);
 const item=rows[0];
 if(!item||Date.parse(item.expires_at)<=Date.now()||item.completed_at) {
  await telegram(env,'sendMessage',{chat_id:id,text:messages.expired});return;
 }
 await telegram(env,'sendMessage',{chat_id:id,text:`Подтвердить регистрацию в SupportOS для логина «${item.login}»?\nНажимайте кнопку только если вы сами начали регистрацию на сайте. Сверьте логин. Это не выдаёт рабочие роли — их назначит администратор.`,reply_markup:{inline_keyboard:[[{text:'Подтвердить мою заявку',callback_data:`confirm:${match[1]}`}]]}});
}

export default async function handler(req,res) {
 res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json; charset=utf-8');
 const send=(status,data)=>{res.statusCode=status;res.end(JSON.stringify(data));};
 try {
  const action=new URL(req.url,'http://localhost').searchParams.get('action');
  if(req.method!=='POST')return send(405,{error:'Method not allowed'});
  const env=config(process.env,['TELEGRAM_BOT_TOKEN','TELEGRAM_BOT_USERNAME','TELEGRAM_WEBHOOK_SECRET']);
  if(!/^[A-Za-z0-9_]{5,32}$/.test(env.TELEGRAM_BOT_USERNAME)||!/^[A-Za-z0-9_-]{32,256}$/.test(env.TELEGRAM_WEBHOOK_SECRET))throw fail('Регистрация через Telegram ещё не настроена',503);
  if(action==='webhook') {
   if(!equal(req.headers['x-telegram-bot-api-secret-token'],env.TELEGRAM_WEBHOOK_SECRET))throw fail('Forbidden',403);
  } else if(!req.headers.origin||new URL(req.headers.origin).host!==req.headers.host) throw fail('Invalid origin',403);
  const raw=typeof req.body==='string'?req.body:JSON.stringify(req.body??{});
  if(Buffer.byteLength(raw)>16384)throw fail('Request too large',413);
  let body;try{body=JSON.parse(raw);}catch{throw fail('Invalid JSON');}
  if(!body||typeof body!=='object'||Array.isArray(body))throw fail('Invalid JSON');
  if(action==='webhook'){await webhook(body,env);return send(200,{ok:true});}
  if(action?.startsWith('password-'))return send(200,await passwordAction(req,action.slice(9),body,env));
  if(action?.startsWith('2fa-'))return send(200,await twoFactorAction(req,await requireIdentity(req,env),action.slice(4),body,env));
  if(action==='begin') {
   let login;try{login=normalizeLogin(body.login);}catch(error){throw fail(error.message);}
   const browserToken=randomBytes(32).toString('base64url'),startToken=randomBytes(32).toString('base64url');
   // On Vercel this header is overwritten by the platform, unlike arbitrary X-Forwarded-For.
   const ip=env.VERCEL==='1'?req.headers['x-vercel-forwarded-for']:req.socket?.remoteAddress;
   const result=checked(await db(env,'rpc/supportos_tg_begin',{request_id:randomUUID(),login_name:login,browser_digest:hash(browserToken),start_digest:hash(startToken),ip_digest:createHmac('sha256',env.TELEGRAM_WEBHOOK_SECRET).update(String(ip??'unknown')).digest('hex')}));
   return send(200,{login,browserToken,expiresAt:result.expiresAt,telegramUrl:`https://t.me/${env.TELEGRAM_BOT_USERNAME}?start=${startToken}`});
  }
  if(!['status','complete'].includes(action)||!validToken(body.browserToken))throw fail('Некорректная заявка');
  if(action==='status') {
   const rows=await db(env,`supportos_telegram_registration?select=verified_at,completed_at,expires_at&browser_hash=eq.${hash(body.browserToken)}&limit=1`);
   if(!rows[0]||Date.parse(rows[0].expires_at)<=Date.now())throw fail(messages.expired,410);
   return send(200,{verified:Boolean(rows[0].verified_at),completed:Boolean(rows[0].completed_at)});
  }
  if(typeof body.password!=='string'||body.password.length<12||body.password.length>128)throw fail('Пароль должен содержать от 12 до 128 символов');
  const claim=checked(await db(env,'rpc/supportos_tg_claim',{browser_digest:hash(body.browserToken)}));
  if(!claim.completed) {
   const admin=adminClient(env);
   const existing=await admin.getUserById(claim.id);
   if(existing.error && existing.error.status!==404 && existing.error.code!=='user_not_found')throw fail('Сервис регистрации временно недоступен',503);
   if(existing.data?.user) {
    if(existing.data.user.app_metadata?.telegram_registration!==claim.id)throw fail('Не удалось завершить регистрацию',409);
   } else {
    const created=await admin.createUser({id:claim.id,email:loginEmail(claim.login),password:body.password,email_confirm:true,app_metadata:{telegram_registration:claim.id,telegram_id:String(claim.telegram_id)}});
    if(created.error)throw fail('Не удалось создать аккаунт. Проверьте требования к паролю и повторите завершение регистрации.',409);
   }
   if(!await db(env,'rpc/supportos_tg_finish',{request_id:claim.id}))throw fail('Не удалось завершить регистрацию. Попробуйте ещё раз.',503);
  }
  return send(200,{login:claim.login});
 }catch(error){return send(error.status??503,{error:error.status?error.message:'Регистрация временно недоступна. Обратитесь к администратору.',code:error.code});}
}
