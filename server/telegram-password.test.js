import {beforeEach,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({db:vi.fn(),requireUser:vi.fn(),update:vi.fn(),telegram:vi.fn()}));
vi.mock('./agent-monitor/_server.js',()=>({db:mocks.db}));
vi.mock('./accounts/index.js',()=>({adminClient:()=>({updateUserById:mocks.update})}));
vi.mock('./_auth.js',()=>({requireUser:mocks.requireUser}));
vi.mock('./telegram-2fa.js',async()=>{const {createHash}=await import('node:crypto');return {digest:value=>createHash('sha256').update(value).digest('hex'),telegram:mocks.telegram};});
import {passwordAction,passwordBot} from './telegram-password.js';
const env={TELEGRAM_WEBHOOK_SECRET:'secret',TELEGRAM_BOT_USERNAME:'GetSupportOSBot'};
const request={headers:{},socket:{remoteAddress:'test'}};
const token='a'.repeat(43);
beforeEach(()=>{vi.clearAllMocks();mocks.requireUser.mockResolvedValue({id:'user',sessionId:'session'});});
it('binds change to authenticated identity, never to a client-supplied id',async()=>{
 mocks.db.mockResolvedValue({status:'pending'});
 const result=await passwordAction(request,'begin',{mode:'change',userId:'attacker'},env);
 expect(mocks.requireUser).toHaveBeenCalled();
 expect(mocks.db.mock.calls[0][2]).toMatchObject({subject:'user',sid:'session'});
 expect(result.browserToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
 expect(result.telegramUrl).toMatch(/start=pw_[A-Za-z0-9_-]{43}$/);
 expect(JSON.stringify(mocks.db.mock.calls)).not.toContain(result.browserToken);
});
it('keeps recovery independent of a session and does not disclose account existence',async()=>{
 mocks.db.mockResolvedValue({status:'pending'});
 const result=await passwordAction(request,'begin',{mode:'recovery',login:'missing'},env);
 expect(mocks.requireUser).not.toHaveBeenCalled();
 expect(mocks.db.mock.calls[0][2]).toMatchObject({subject:null,sid:null,identity_email:'missing@telegram.supportos.invalid'});
 expect(result).not.toHaveProperty('userId');
});
it('never calls Auth without a successfully claimed approval',async()=>{
 mocks.db.mockResolvedValueOnce([{status:'pending',expires_at:new Date(Date.now()+60000).toISOString()}]).mockResolvedValueOnce({error:'invalid'});
 await expect(passwordAction(request,'complete',{browserToken:token,password:'long enough password'},env)).rejects.toMatchObject({status:409});
 expect(mocks.update).not.toHaveBeenCalled();
});
it('uses a server-only one-use permit and returns no credential or metadata',async()=>{
 mocks.db.mockResolvedValueOnce([{status:'approved',expires_at:new Date(Date.now()+60000).toISOString()}]).mockResolvedValueOnce({userId:'user'});
 mocks.update.mockResolvedValue({error:null});
 expect(await passwordAction(request,'complete',{browserToken:token,password:'long enough password'},env)).toEqual({status:'completed'});
 expect(mocks.update.mock.calls[0][0]).toBe('user');
 expect(mocks.update.mock.calls[0][1].app_metadata.supportos_password_permit).toMatch(/^[A-Za-z0-9_-]{43}$/);
 expect(mocks.db.mock.calls[1][2].permit_digest).toMatch(/^[a-f0-9]{64}$/);
});
it('rejects group and mismatched callbacks before touching storage',async()=>{
 for(const chat of [{id:123,type:'group'},{id:999,type:'private'}])expect(await passwordBot({callback_query:{from:{id:123},message:{chat},data:`pw_yes:${token}`}},env)).toBe(false);
 expect(mocks.db).not.toHaveBeenCalled();
});
it('passes the actual Telegram sender to the atomic decision',async()=>{
 mocks.db.mockResolvedValue(false);
 await passwordBot({callback_query:{id:'cb',from:{id:123},message:{chat:{id:123,type:'private'}},data:`pw_yes:${token}`}},env);
 expect(mocks.db.mock.calls[0][2]).toMatchObject({tg:123,approve:true});
 expect(JSON.stringify(mocks.db.mock.calls)).not.toContain(token);
});
