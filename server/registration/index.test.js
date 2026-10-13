import {expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({logout:vi.fn()}));
vi.mock('../session-logout.js',()=>({logoutAction:mocks.logout}));
vi.mock('../agent-monitor/_server.js',()=>({config:()=>({})}));
import handler from './index.js';
const res=()=>({setHeader(){},end(text){this.body=JSON.parse(text);}});
it.each(['webhook','begin','complete','2fa-begin','password-begin'])('retires bot endpoint %s without calling any external service',async(action)=>{
 const response=res();await handler({method:'POST',url:'/?action='+action,headers:{}},response);
 expect(response.statusCode).toBe(410);expect(mocks.logout).not.toHaveBeenCalled();
});
it('keeps same-origin logout available before MFA',async()=>{
 mocks.logout.mockResolvedValue({ok:true});const response=res();
 await handler({method:'POST',url:'/?action=logout',headers:{host:'app.test',origin:'https://app.test'}},response);
 expect(response.statusCode).toBe(200);expect(mocks.logout).toHaveBeenCalled();
});
it('rejects cross-origin logout',async()=>{
 const response=res();await handler({method:'POST',url:'/?action=logout',headers:{host:'app.test',origin:'https://evil.test'}},response);
 expect(response.statusCode).toBe(403);
});
