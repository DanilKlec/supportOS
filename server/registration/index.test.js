import {beforeEach,afterEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({db:vi.fn(),createUser:vi.fn(),getUserById:vi.fn()}));
vi.mock('../accounts/index.js',()=>({adminClient:()=>({createUser:mocks.createUser,getUserById:mocks.getUserById})}));
vi.mock('../agent-monitor/_server.js',async importOriginal=>({...await importOriginal(),db:mocks.db}));
import handler from './index.js';
const secret='s'.repeat(40),token='a'.repeat(43);
const req=(action,body={},headers={})=>({method:'POST',url:`/api/registration?action=${action}`,headers:{host:'app.test',origin:'https://app.test',...headers},body,socket:{remoteAddress:'127.0.0.1'}});
const res=()=>({setHeader(){},end(s){this.body=JSON.parse(s);}});
const claim={id:'11111111-1111-4111-8111-111111111111',login:'operator',telegram_id:123,completed:false};
beforeEach(()=>{
 vi.resetAllMocks();
 vi.stubEnv('SUPABASE_URL','https://test.supabase.co');vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY','server-test');vi.stubEnv('TELEGRAM_BOT_TOKEN','test-token');vi.stubEnv('TELEGRAM_BOT_USERNAME','GetSupportOSBot');vi.stubEnv('TELEGRAM_WEBHOOK_SECRET',secret);
 vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({ok:true,result:{}}))));
 mocks.getUserById.mockResolvedValue({data:{user:null},error:{status:404,code:'user_not_found'}});
 mocks.createUser.mockResolvedValue({data:{user:{id:claim.id}},error:null});
});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
it('rejects forged webhooks before querying or sending messages',async()=>{
 const r=res();await handler(req('webhook',{message:{}},{'x-telegram-bot-api-secret-token':'forged'}),r);
 expect(r.statusCode).toBe(403);expect(mocks.db).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();
});
it('rejects cross-origin browser requests',async()=>{
 const r=res();await handler(req('begin',{login:'operator'},{origin:'https://evil.test'}),r);expect(r.statusCode).toBe(403);expect(mocks.db).not.toHaveBeenCalled();
});
it('creates separate browser and Telegram proofs; stores only digests',async()=>{
 mocks.db.mockResolvedValue({expiresAt:new Date(Date.now()+1200000).toISOString()});
 const r=res();await handler(req('begin',{login:' Operator ',password:'never-store'}),r);
 expect(r.statusCode).toBe(200);expect(r.body.login).toBe('operator');
 const start=new URL(r.body.telegramUrl).searchParams.get('start');expect(start).not.toBe(r.body.browserToken);
 const payload=mocks.db.mock.calls[0][2];expect(payload.browser_digest).toHaveLength(64);expect(payload.start_digest).toHaveLength(64);expect(JSON.stringify(payload)).not.toContain('never-store');expect(JSON.stringify(payload)).not.toContain('127.0.0.1');
});
it('does not create an account before Telegram confirmation',async()=>{
 mocks.db.mockResolvedValue({error:'not_verified'});const r=res();await handler(req('complete',{browserToken:token,password:'long-password'}),r);
 expect(r.statusCode).toBe(409);expect(mocks.createUser).not.toHaveBeenCalled();
});
it('creates an internal login identity without trusting requested roles or email',async()=>{
 mocks.db.mockResolvedValueOnce(claim).mockResolvedValueOnce(true);
 const r=res();await handler(req('complete',{browserToken:token,password:'long-password',email:'owner@example.com',roles:['creator']}),r);
 expect(r.statusCode).toBe(200);
 expect(mocks.createUser).toHaveBeenCalledWith({id:claim.id,email:'operator@telegram.supportos.invalid',password:'long-password',email_confirm:true,app_metadata:{telegram_registration:claim.id,telegram_id:'123'}});
});
it('recovers a partial create without resetting the original password',async()=>{
 mocks.db.mockResolvedValueOnce(claim).mockResolvedValueOnce(true);mocks.getUserById.mockResolvedValue({data:{user:{id:claim.id,app_metadata:{telegram_registration:claim.id}}},error:null});
 const r=res();await handler(req('complete',{browserToken:token,password:'different-password'}),r);
 expect(r.statusCode).toBe(200);expect(mocks.createUser).not.toHaveBeenCalled();
});
it('does not attach an unrelated existing account',async()=>{
 mocks.db.mockResolvedValue(claim);mocks.getUserById.mockResolvedValue({data:{user:{app_metadata:{}}},error:null});
 const r=res();await handler(req('complete',{browserToken:token,password:'long-password'}),r);expect(r.statusCode).toBe(409);expect(mocks.db).toHaveBeenCalledTimes(1);
});
it('ignores group confirmations and user IDs supplied outside Telegram sender',async()=>{
 const r=res();await handler(req('webhook',{callback_query:{from:{id:123},data:`confirm:${token}`,message:{chat:{type:'group',id:123}}}},{'x-telegram-bot-api-secret-token':secret}),r);expect(r.statusCode).toBe(200);expect(mocks.db).not.toHaveBeenCalled();
});
it('confirms using the authenticated private-chat sender',async()=>{
 mocks.db.mockResolvedValue({ok:true,login:'operator'});const r=res();await handler(req('webhook',{callback_query:{id:'callback',from:{id:123,username:'operator_tg'},data:`confirm:${token}`,message:{chat:{type:'private',id:123}}}},{'x-telegram-bot-api-secret-token':secret}),r);
 expect(r.statusCode).toBe(200);expect(mocks.db.mock.calls[0][2]).toMatchObject({tg_id:123,tg_username:'operator_tg'});expect(fetch).toHaveBeenCalledTimes(2);
});
