import { afterEach,beforeEach,expect,it,vi } from 'vitest';
const mocks=vi.hoisted(()=>({db:vi.fn(),telegram:vi.fn()}));
vi.mock('./agent-monitor/_server.js',async original=>({...await original(),db:mocks.db}));
vi.mock('./telegram-2fa.js',async original=>({...await original(),telegram:mocks.telegram}));
import { criticalAction,criticalCallback,executeCritical } from './telegram-critical.js';
import { digest } from './telegram-2fa.js';
const env={SUPABASE_URL:'https://test.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'synthetic-server',TELEGRAM_BOT_TOKEN:'existing-bot',TELEGRAM_WEBHOOK_SECRET:'s'.repeat(40)};
const actor={id:'11111111-1111-4111-8111-111111111111',sessionId:'22222222-2222-4222-8222-222222222222',access:{status:'active',roles:[],permissions:['work','users.manage','roles.manage']}};
const id='33333333-3333-4333-8333-333333333333',proof={id,token:'t'.repeat(43)};
const req={headers:{'user-agent':'Mozilla/5.0 Chrome/130.0','x-forwarded-for':'forged'},socket:{remoteAddress:'192.0.2.1'}};
beforeEach(()=>{vi.resetAllMocks();mocks.telegram.mockResolvedValue({});});
afterEach(()=>vi.unstubAllGlobals());
it('reuses the bot transport with separate hashed callback/one-time browser credentials, never raw IP',async()=>{
 mocks.db.mockResolvedValue({id,status:'pending',telegramId:123,expiresAt:'future',target:'extra-internal'});
 const result=await criticalAction(req,actor,{operation:'begin',action:'sessions.revoke_others',payload:{},actor:'forged',session_id:'forged'},env);
 const data=mocks.db.mock.calls[0][2];
 expect(data).toMatchObject({actor:actor.id,sid:actor.sessionId,operation:'sessions.revoke_others',payload:{}});
 expect(data.ip_digest).toMatch(/^[a-f0-9]{64}$/);expect(data.permit_digest).toBe(digest(result.token));
 const [usedEnv,method,message]=mocks.telegram.mock.calls[0];expect(usedEnv.TELEGRAM_BOT_TOKEN).toBe('existing-bot');expect(method).toBe('sendMessage');expect(message.chat_id).toBe(123);
 const callback=message.reply_markup.inline_keyboard[0][0].callback_data;
 expect(callback.length).toBeLessThanOrEqual(64);const callbackToken=callback.split(':')[1];expect(data.callback_digest).toBe(digest(callbackToken));expect(callbackToken).not.toBe(result.token);
 expect(result).toEqual({id,status:'pending',expiresAt:'future',token:expect.any(String)});
 expect(JSON.stringify(data)).not.toMatch(/192\.0\.2\.1|forged/);expect(JSON.stringify(result)).not.toMatch(/telegramId|internal/);
});
it('keeps account creation password out of the generic request/storage/Telegram message',async()=>{
 mocks.db.mockResolvedValue({id,status:'pending',telegramId:123});
 await criticalAction(req,actor,{operation:'begin',action:'user.create',payload:{email:'new@example.test',roles:['support'],password:'synthetic-secret-password'}},env);
 expect(JSON.stringify(mocks.db.mock.calls)).not.toContain('synthetic-secret-password');expect(JSON.stringify(mocks.telegram.mock.calls)).not.toContain('synthetic-secret-password');
});
it('cancels an undelivered challenge and never touches login/password challenges',async()=>{
 mocks.db.mockResolvedValue({id,status:'pending',telegramId:123});mocks.telegram.mockRejectedValue(new Error('Unavailable'));
 await expect(criticalAction(req,actor,{operation:'begin',action:'telegram.unlink',payload:{}},env)).rejects.toThrow('Unavailable');
 expect(mocks.db.mock.calls.map(c=>c[1])).toEqual(['rpc/supportos_critical_begin','rpc/supportos_critical_state']);expect(mocks.db.mock.calls[1][2].cancel).toBe(true);
});
it('requires a proof before executing and ignores actor/session supplied inside proof',async()=>{
 await expect(executeCritical(actor,'sessions.revoke_others',{},null,env)).rejects.toMatchObject({status:428,code:'critical_confirmation_required'});
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({ok:true})));
 await executeCritical(actor,'sessions.revoke_others',{}, {...proof,actor:'forged',session_id:'forged'},env);
 expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({actor:actor.id,sid:actor.sessionId,operation:'sessions.revoke_others',payload:{},request_id:id,permit_digest:digest(proof.token)});
 expect(fetch.mock.calls[0][0]).toContain('/rpc/supportos_critical_execute');
});
it.each(['sessions.revoke_others','telegram.unlink','telegram.change'])('rejects target overrides for %s',async(action)=>{
 await expect(criticalAction(req,actor,{operation:'begin',action,payload:{target:'another-user'}},env)).rejects.toMatchObject({status:400});expect(mocks.db).not.toHaveBeenCalled();
});
it('rejects missing sessions, unknown actions and insufficient permissions before sending',async()=>{
 for(const [who,action,status] of [[{...actor,sessionId:null},'sessions.revoke_others',401],[actor,'password.change',400],[{...actor,access:{status:'active',roles:[],permissions:['work']}},'role.delete',403]]) {
  await expect(criticalAction(req,who,{operation:'begin',action,payload:{id:'custom'}},env)).rejects.toMatchObject({status});
 }
 expect(mocks.telegram).not.toHaveBeenCalled();expect(mocks.db).not.toHaveBeenCalled();
});
it.each([['40001',409],['42501',403]])('preserves database error %s as HTTP %s',async(code,status)=>{
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({code,message:'Safe error'},{status:400})));
 await expect(executeCritical(actor,'sessions.revoke_others',{},proof,env)).rejects.toMatchObject({status});
});
it('handles callbacks only through a verified private-chat sender and hashes the bot token',async()=>{
 const callback={id:'callback',from:{id:123},message:{chat:{type:'private',id:123}},data:'critical_approve:'+'a'.repeat(43)};
 expect(await criticalCallback({...callback,message:{chat:{type:'group',id:123}}},env)).toBe(false);
 expect(await criticalCallback({...callback,from:{id:999}},env)).toBe(false);
 expect(await criticalCallback({...callback,data:'login_approve:'+'a'.repeat(43)},env)).toBe(false);
 expect(mocks.db).not.toHaveBeenCalled();mocks.db.mockResolvedValue({status:'approved'});
 expect(await criticalCallback(callback,env)).toBe(true);
 expect(mocks.db).toHaveBeenCalledWith(env,'rpc/supportos_critical_decide',{digest:digest('a'.repeat(43)),tg:123,decision:'approved'});
});
