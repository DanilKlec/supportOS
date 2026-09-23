import {createHmac,randomBytes,randomUUID} from 'node:crypto';
import {db} from './agent-monitor/_server.js';
import {adminClient} from './accounts/index.js';
import {requireUser} from './_auth.js';
import {digest,telegram} from './telegram-2fa.js';
import {loginEmail} from '../shared/login-identity.js';
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const valid=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{43}$/.test(value);
const random=()=>randomBytes(32).toString('base64url');
export async function passwordAction(req,action,body,env) {
 if(action==='begin') {
  if(!['change','recovery'].includes(body.mode))throw fail('Некорректное действие');
  const user=body.mode==='change'?await requireUser(req,{permission:null,env}):null;
  let email='';
  if(!user) {
   if(typeof body.login!=='string'||body.login.length>254)throw fail('Введите логин или email');
   try{email=loginEmail(body.login).toLowerCase();}catch{throw fail('Введите корректный логин или email');}
  }
  const browserToken=random(),challengeToken=random();
  const ip=env.VERCEL==='1'?req.headers['x-vercel-forwarded-for']:req.socket?.remoteAddress;
  const hmac=value=>createHmac('sha256',env.TELEGRAM_WEBHOOK_SECRET).update(value).digest('hex');
  const result=await db(env,'rpc/supportos_password_begin',{request_id:randomUUID(),subject:user?.id??null,sid:user?.sessionId??null,identity_email:email,identity_digest:hmac(user?.id??email),ip_digest:hmac(String(ip??'unknown')),browser_digest:digest(browserToken),challenge_digest:digest(challengeToken)});
  if(result.error)throw fail('Слишком много запросов. Подождите минуту; лимит — 5 запросов в час на аккаунт.',429);
  return {...result,browserToken,telegramUrl:`https://t.me/${env.TELEGRAM_BOT_USERNAME}?start=pw_${challengeToken}`};
 }
 if(!valid(body.browserToken))throw fail('Запрос недоступен. Начните заново.',410);
 const filter=`browser_hash=eq.${digest(body.browserToken)}`;
 const rows=await db(env,`supportos_password_requests?select=status,expires_at&${filter}&limit=1`);
 const row=rows[0];
 if(!row)throw fail('Запрос недоступен. Начните заново.',410);
 const status=row.status==='completed'?'completed':Date.parse(row.expires_at)<=Date.now()?'expired':row.status;
 if(action==='status')return {status,expiresAt:row.expires_at};
 if(action==='cancel') {
  await db(env,`supportos_password_requests?${filter}&status=in.(pending,approved)`,{status:'rejected'},'PATCH');
  return {status:'rejected'};
 }
 if(action!=='complete')throw fail('Неизвестное действие');
 if(status==='completed')return {status};
 if(typeof body.password!=='string'||body.password.length<12||body.password.length>128||Buffer.byteLength(body.password)>72)throw fail('Пароль: 12–128 символов, не более 72 байт UTF-8.');
 const permit=random();
 const claim=await db(env,'rpc/supportos_password_claim',{browser_digest:digest(body.browserToken),permit_digest:digest(permit)});
 if(claim.error)throw fail('Подтвердите запрос в Telegram. Если он истёк или уже использован — начните заново.',409);
 // Auth validates and hashes the password, clears recovery tokens and sessions.
 // The deferred DB guard consumes this server-only permit in that transaction.
 const {error}=await adminClient(env).updateUserById(claim.userId,{password:body.password,app_metadata:{supportos_password_permit:permit}});
 if(error) {
  await db(env,`supportos_password_requests?${filter}&status=eq.processing`,{status:'rejected',permit_hash:null},'PATCH');
  throw fail('Не удалось изменить пароль. Проверьте требования к паролю и создайте новый запрос. Если связь прервалась, сначала проверьте статус.',409);
 }
 return {status:'completed'};
}

export async function passwordBot(body,env) {
 const callback=body.callback_query;
 const message=callback?.message??body.message;
 const sender=callback?.from??body.message?.from;
 if(message?.chat?.type!=='private'||message.chat.id!==sender?.id||sender?.is_bot||!Number.isSafeInteger(sender?.id)||sender.id<=0)return false;
 const decision=/^pw_(yes|no):([A-Za-z0-9_-]{43})$/.exec(callback?.data??'');
 const start=/^\/start(?:@\w+)? pw_([A-Za-z0-9_-]{43})$/.exec(body.message?.text??'');
 if(!decision&&!start)return false;
 if(decision) {
  const ok=await db(env,'rpc/supportos_password_decide',{challenge_digest:digest(decision[2]),tg:sender.id,approve:decision[1]==='yes'});
  const text=!ok?'Запрос истёк, уже обработан или недоступен этому аккаунту.':decision[1]==='yes'?'✅ Подтверждено. Вернитесь в ту же вкладку SupportOS и задайте новый пароль.':'❌ Смена пароля отклонена.';
  await telegram(env,'answerCallbackQuery',{callback_query_id:callback.id,text});
  await telegram(env,'sendMessage',{chat_id:sender.id,text});
  return true;
 }
 const rows=await db(env,`supportos_password_requests?select=mode&challenge_hash=eq.${digest(start[1])}&telegram_id=eq.${sender.id}&status=eq.pending&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&limit=1`);
 if(!rows[0]) {
  await telegram(env,'sendMessage',{chat_id:sender.id,text:'Запрос недоступен. Используйте Telegram, ранее привязанный к этому аккаунту, или создайте новый запрос. Если привязки нет — обратитесь к администратору.'});return true;
 }
 await telegram(env,'sendMessage',{chat_id:sender.id,text:`🔐 ${rows[0].mode==='recovery'?'Восстановление':'Смена'} пароля SupportOS\n\nПодтверждайте, только если вы сами открыли эту ссылку из своей вкладки SupportOS. После подтверждения в этой вкладке можно будет задать новый пароль. Все старые сеансы завершатся.\n\nЗапрос действует 5 минут. Не пересылайте ссылки и не отправляйте боту пароль.`,reply_markup:{inline_keyboard:[[{text:'✅ Разрешить смену пароля',callback_data:`pw_yes:${start[1]}`}],[{text:'❌ Отклонить',callback_data:`pw_no:${start[1]}`}]]}});
 return true;
}
