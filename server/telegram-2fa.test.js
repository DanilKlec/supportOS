import {beforeEach,afterEach,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({db:vi.fn()}));
vi.mock('./agent-monitor/_server.js',()=>({db:mocks.db,config:e=>e}));
import {twoFactorAction,loginCallback,requireTelegram} from './telegram-2fa.js';
const env={TELEGRAM_BOT_TOKEN:'not-a-real-token',TELEGRAM_WEBHOOK_SECRET:'secret',TELEGRAM_BOT_USERNAME:'GetSupportOSBot'};
const user={id:'user',sessionId:'session'};
beforeEach(()=>{vi.clearAllMocks();vi.stubGlobal('fetch',vi.fn(async()=>new Response('{"ok":true,"result":{}}')));});
afterEach(()=>vi.unstubAllGlobals());
it('only sends to the server-linked Telegram and persists a digest, not the callback token',async()=>{
 mocks.db.mockResolvedValue({status:'pending',id:'id',send:true,telegramId:123});
 const result=await twoFactorAction({headers:{'user-agent':'Chrome/1 Windows'},socket:{}},user,'begin',{telegramId:999,user_id:'other'},env);
 const args=mocks.db.mock.calls[0][2];
 expect(args).toMatchObject({subject:'user',sid:'session'});
 expect(args.digest).toMatch(/^[a-f0-9]{64}$/);
 const message=JSON.parse(fetch.mock.calls[0][1].body);
 expect(message.chat_id).toBe(123);
 expect(message.reply_markup.inline_keyboard[0][0].callback_data).toMatch(/^login_approve:[A-Za-z0-9_-]{43}$/);
 expect(JSON.stringify(result)).not.toContain('telegramId');
 expect(JSON.stringify(result)).not.toContain(args.digest);
});
it('restores a pending challenge without sending a duplicate request',async()=>{
 mocks.db.mockResolvedValue({status:'pending',id:'old'});
 expect(await twoFactorAction({headers:{}},user,'begin',{},env)).toMatchObject({status:'pending',id:'old'});
 expect(fetch).not.toHaveBeenCalled();
});
it('fails closed for pending, missing link, rejected, expired and revoked sessions',async()=>{
 for(const status of ['pending','link_required','link_review','rejected','expired']){
  mocks.db.mockResolvedValue({status});await expect(requireTelegram(user,env)).rejects.toMatchObject({status:403,code:'telegram_2fa_required'});
 }
 mocks.db.mockResolvedValue({status:'invalid_session'});await expect(requireTelegram(user,env)).rejects.toMatchObject({status:401});
 mocks.db.mockResolvedValue({status:'approved'});await expect(requireTelegram(user,env)).resolves.toBeUndefined();
});
it('callback uses sender id and only sends a digest into the atomic DB operation',async()=>{
 mocks.db.mockResolvedValue({error:'processed'});
 await loginCallback({id:'cb',from:{id:123},message:{chat:{id:123,type:'private'}},data:'login_approve:'+'a'.repeat(43)},env);
 expect(mocks.db.mock.calls[0][2]).toMatchObject({tg:123,decision:'approved'});
 expect(mocks.db.mock.calls[0][2].digest).toMatch(/^[a-f0-9]{64}$/);
 expect(JSON.parse(fetch.mock.calls[0][1].body).text).toBe('Этот запрос уже обработан.');
});
it('ignores callbacks from groups or a mismatched private chat',async()=>{
 for(const chat of [{id:123,type:'group'},{id:999,type:'private'}])expect(await loginCallback({id:'cb',from:{id:123},message:{chat},data:'login_approve:'+'a'.repeat(43)},env)).toBe(false);
 expect(mocks.db).not.toHaveBeenCalled();
});
it('invalidates the session flow if Telegram delivery fails',async()=>{
 mocks.db.mockResolvedValueOnce({status:'pending',send:true,telegramId:123}).mockResolvedValueOnce(true);
 vi.stubGlobal('fetch',vi.fn(async()=>new Response('{"ok":false}',{status:403})));
 await expect(twoFactorAction({headers:{}},user,'begin',{},env)).rejects.toMatchObject({status:503});
 expect(mocks.db).toHaveBeenLastCalledWith(env,'rpc/supportos_tg_login_cancel',{subject:'user',sid:'session'});
});
