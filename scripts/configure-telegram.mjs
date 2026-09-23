// Run only after the HTTPS registration endpoint and migration are deployed.
// Secrets come from the environment; they are never included in command arguments or logs.
import 'dotenv/config';
const token=process.env.TELEGRAM_BOT_TOKEN;
const secret=process.env.TELEGRAM_WEBHOOK_SECRET;
const origin=process.env.SUPPORTOS_PUBLIC_URL;
if(!token||!secret||!origin)throw new Error('Set TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET and SUPPORTOS_PUBLIC_URL in the environment.');
if(!/^[A-Za-z0-9_-]{32,256}$/.test(secret))throw new Error('Webhook secret must contain 32–256 ASCII letters, digits, underscores or hyphens.');
const url=new URL(origin);
if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw new Error('SUPPORTOS_PUBLIC_URL must be the HTTPS origin of your deployment.');
async function call(method,body) {
 let response;
 try{response=await fetch(`https://api.telegram.org/bot${token}/${method}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});}catch{throw new Error('Telegram could not be reached. No credentials were logged.');}
 const value=await response.json();if(!response.ok||!value.ok)throw new Error(`Telegram rejected ${method}. Check the configuration.`);return value.result;
}
const bot=await call('getMe',{});
if(bot.username?.toLowerCase()!==(process.env.TELEGRAM_BOT_USERNAME??'GetSupportOSBot').toLowerCase())throw new Error('Token belongs to a different bot.');
const endpoint=`${url.origin}/api/registration?action=webhook`;
const probe=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','X-Telegram-Bot-Api-Secret-Token':secret},body:JSON.stringify({}),signal:AbortSignal.timeout(15000)}).catch(()=>null);
if(!probe?.ok)throw new Error('The deployed webhook did not accept its secret. Deploy/configure SupportOS before registering it.');
await call('setWebhook',{url:endpoint,secret_token:secret,allowed_updates:['message','callback_query']});
// Profile is configured separately by configure-telegram-profile.mjs.
const status=await call('getWebhookInfo',{});
if(status.url!==endpoint)throw new Error('Webhook URL was not saved.');
console.log(`Webhook configured for @${bot.username}. Pending updates: ${status.pending_update_count}.`);
