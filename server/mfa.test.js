import { afterEach, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({db:vi.fn()}));
vi.mock('./agent-monitor/_server.js',()=>({config:env=>env,db:mocks.db}));
import {requireMfa} from './mfa.js';
afterEach(()=>vi.clearAllMocks());
const user={id:'user',sessionId:'session',aal:'aal2'};
it('requires both the verified bearer AAL2 and a live verified TOTP factor',async()=>{
 mocks.db.mockResolvedValue({status:'approved'});
 await expect(requireMfa({...user,aal:'aal1'},{})).rejects.toMatchObject({status:403,code:'mfa_required'});
 await expect(requireMfa(user,{})).resolves.toBeUndefined();
 mocks.db.mockResolvedValue({status:'mfa_required'});
 await expect(requireMfa(user,{})).rejects.toMatchObject({status:403,code:'mfa_required'});
});
it('rejects revoked sessions and never grants access on storage failure',async()=>{
 mocks.db.mockResolvedValue({status:'invalid_session'});
 await expect(requireMfa(user,{})).rejects.toMatchObject({status:401});
 mocks.db.mockRejectedValue(new Error('offline'));
 await expect(requireMfa(user,{})).rejects.toThrow('offline');
});
it('allows a live AAL1 session only when the server confirms MFA is not enabled',async()=>{
 mocks.db.mockResolvedValue({status:'approved',mfaEnabled:false});
 const optional={...user,aal:'aal1'};
 await expect(requireMfa(optional,{})).resolves.toBeUndefined();
 expect(optional.mfaEnabled).toBe(false);
 mocks.db.mockResolvedValue({status:'approved',mfaEnabled:true});
 await expect(requireMfa(optional,{})).rejects.toMatchObject({status:403,code:'mfa_required'});
});
