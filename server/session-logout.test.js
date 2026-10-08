import { beforeEach, expect, it, vi } from 'vitest';
const mock=vi.hoisted(()=>({identity:vi.fn(),signOut:vi.fn(),db:vi.fn()}));
vi.mock('./_auth.js',()=>({requireIdentity:mock.identity}));
vi.mock('./accounts/index.js',()=>({adminClient:()=>({signOut:mock.signOut})}));
vi.mock('./agent-monitor/_server.js',()=>({db:mock.db}));
import { logoutAction } from './session-logout.js';
import { securityMetadata } from './security-metadata.js';
const env={TELEGRAM_WEBHOOK_SECRET:'synthetic-key'};
const request={headers:{authorization:'Bearer synthetic-access','user-agent':'Mozilla/5.0 (Windows) Chrome/130','x-forwarded-for':'198.51.100.22'},socket:{remoteAddress:'192.0.2.10'}};
beforeEach(()=>{vi.resetAllMocks();mock.identity.mockResolvedValue({id:'verified',sessionId:'verified-session'});mock.signOut.mockResolvedValue({error:null});mock.db.mockResolvedValue({ok:true});});

it('records only the verified identity after Auth revokes the local session, with hashed IP and no tokens',async()=>{
 expect(await logoutAction({...request,body:{user_id:'forged',scope:'global'}},env)).toEqual({ok:true});
 expect(mock.signOut).toHaveBeenCalledWith('synthetic-access','local');
 expect(mock.db.mock.calls[0]).toEqual([env,'rpc/supportos_request_logout_audit',{subject:'verified',sid:'verified-session'}]);
 expect(mock.db.mock.invocationCallOrder[0]).toBeLessThan(mock.signOut.mock.invocationCallOrder[0]);
 expect(mock.signOut.mock.invocationCallOrder[0]).toBeLessThan(mock.db.mock.invocationCallOrder[1]);
 expect(mock.db.mock.calls[1][2]).toMatchObject({subject:'verified',sid:'verified-session',ip_digest:expect.stringMatching(/^[a-f0-9]{64}$/)});
 expect(JSON.stringify(mock.db.mock.calls)).not.toMatch(/synthetic-access|192\.0\.2\.10|198\.51\.100\.22/);
});
it('does not journal success on an Auth/network failure or any event for an unverified caller',async()=>{
 mock.signOut.mockResolvedValue({error:{status:500,message:'synthetic-private-detail'}});
 await expect(logoutAction(request,env)).rejects.toMatchObject({status:503});expect(mock.db).toHaveBeenCalledTimes(1);
 expect(mock.db.mock.calls[0][1]).toBe('rpc/supportos_request_logout_audit');mock.db.mockClear();
 mock.identity.mockRejectedValue(Object.assign(new Error('invalid'),{status:401}));
 await expect(logoutAction(request,env)).rejects.toMatchObject({status:401});expect(mock.db).not.toHaveBeenCalled();
});
it('does not revoke a session if the pre-Auth audit cannot be persisted',async()=>{
 mock.db.mockRejectedValue(new Error('synthetic audit unavailable'));
 await expect(logoutAction(request,env)).rejects.toThrow('synthetic audit unavailable');expect(mock.signOut).not.toHaveBeenCalled();
});
it('allows idempotent retries only after the database confirms the session is gone',async()=>{
 mock.signOut.mockResolvedValue({error:{status:401}});
 expect(await logoutAction(request,env)).toEqual({ok:true});
 mock.db.mockResolvedValue({error:'not_revoked'});
 await expect(logoutAction(request,env)).rejects.toMatchObject({status:503});
});
it('hashes only trusted IP sources and uses no raw-IP fallback',()=>{
 const metadata=securityMetadata(request,env);
 expect(metadata.ipHash).toMatch(/^[a-f0-9]{64}$/);
 expect(securityMetadata({...request,headers:{...request.headers,'x-forwarded-for':'forged'}},env).ipHash).toBe(metadata.ipHash);
 expect(securityMetadata({...request,headers:{...request.headers,'x-vercel-forwarded-for':'198.51.100.1, 198.51.100.2'}},{...env,VERCEL:'1'}).ipHash).not.toBe(metadata.ipHash);
 expect(securityMetadata({headers:{}},env).ipHash).toBeNull();
 expect(securityMetadata({headers:{},socket:{remoteAddress:'not-an-IP'}},env).ipHash).toBeNull();
 expect(securityMetadata(request,{...env,TELEGRAM_WEBHOOK_SECRET:'rotated-key'}).ipHash).not.toBe(metadata.ipHash);
});
