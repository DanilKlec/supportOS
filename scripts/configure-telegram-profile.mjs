import 'dotenv/config';
import { configureProfile } from './telegram-profile.mjs';

async function call(method, body) {
  const multipart = body instanceof FormData;
  let response;
  try {
    response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`, {
      method: 'POST',
      headers: multipart ? undefined : { 'Content-Type': 'application/json' },
      body: multipart ? body : JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
  } catch { throw new Error('Telegram is unavailable. Credentials were not logged.'); }
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(`Telegram rejected ${method}.`);
  return data.result;
}
try {
  if (!process.env.TELEGRAM_BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN is missing.');
  const bot = await call('getMe', {});
  if (bot.username !== 'GetSupportOSBot') throw new Error('Unexpected bot: profile was not changed.');
  await configureProfile(call);
  const photos = await call('getUserProfilePhotos', { user_id: bot.id, limit: 1 });
  if (!photos.total_count) throw new Error('Profile photo was not saved.');
  console.log('Profile, commands and avatar verified for @GetSupportOSBot.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
