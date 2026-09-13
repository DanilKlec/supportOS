import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const mock=vi.hoisted(()=>({requireUser:vi.fn(),changeAccess:vi.fn(),db:vi.fn(),allRows:vi.fn(),createUser:vi.fn()}));
vi.mock('../_auth.js',()=>({requireUser:mock.requireUser}));
vi.mock('../_rbac.js',()=>({changeAccess:mock.changeAccess}));
vi.mock('../agent-monitor/_server.js',()=>({config:()=>({SUPABASE_URL:'https://test.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test'}),db:mock.db,allRows:mock.allRows}));
vi.mock('@supabase/supabase-js',()=>({createClient:()=>({auth:{admin:{createUser:mock.createUser}}})}));
import handler from './index.js';
const response=()=>({setHeader(){},end(text){this.body=JSON.parse(text);}});
const req=(body)=>({method:'POST',url:'/api/accounts',headers:{origin:'https://app.test',host:'app.test'},body});
beforeEach(()=>{vi.resetAllMocks();mock.requireUser.mockResolvedValue({id:'verified',access:{status:'active',roles:[{id:'admin',name:'Admin'}],permissions:['work','users.manage','roles.manage']}});});
afterEach(()=>vi.unstubAllGlobals());
it('passes only the verified actor to transactional permission changes',async()=>{
 mock.changeAccess.mockResolvedValue({ok:true});const res=response();const payload={id:'user',roles:['support'],status:'active',version:1};
 await handler(req({action:'user.update',payload,actor:'forged'}),res);
 expect(mock.changeAccess).toHaveBeenCalledWith('verified','user.update',payload);expect(res.statusCode).toBe(200);
});
it('lets an unassigned account read only its own access context',async()=>{
 mock.requireUser.mockResolvedValue({id:'pending',access:{status:'pending',roles:[],permissions:[]}});
 const res=response();await handler({...req(),method:'GET',url:'/api/accounts?action=me'},res);
 expect(res.statusCode).toBe(200);expect(res.body.id).toBe('pending');expect(mock.db).not.toHaveBeenCalled();
 const forbidden=response();await handler({...req(),method:'GET'},forbidden);expect(forbidden.statusCode).toBe(403);
});
it('blocks Creator assignment before creating an Auth account',async()=>{
 mock.allRows.mockImplementation(async(_env,path)=>path.startsWith('supportos_roles?')?[{id:'creator',name:'Creator'}]:path.startsWith('supportos_permissions?')?[{id:'technical'}]:[{role_id:'creator',permission_id:'technical'}]);
 const res=response();await handler(req({action:'create',email:'new@example.com',password:'long-password-123',roles:['creator']}),res);
 expect(res.statusCode).toBe(403);expect(mock.createUser).not.toHaveBeenCalled();
});
it('rejects cross-origin writes before authentication or database access',async()=>{
 const res=response();await handler({...req({}),headers:{origin:'https://evil.test',host:'app.test'}},res);expect(res.statusCode).toBe(403);expect(mock.requireUser).not.toHaveBeenCalled();
});
it('serves an active recipient directory through accounts without granting account management',async()=>{
 mock.requireUser.mockResolvedValue({id:'verified',access:{status:'active',roles:[],permissions:['binds.read']}});
 mock.db.mockResolvedValue([{id:'other',display_name:'Ivan',email:'ivan@example.com'}]);
 const res=response();await handler({...req(),method:'GET',url:'/api/accounts?action=users&purpose=share'},res);
 expect(res.statusCode).toBe(200);expect(res.body.users).toHaveLength(1);
 const path=mock.db.mock.calls[0][1];expect(path).toContain('status=eq.active');expect(path).toContain('id=neq.verified');expect(path).toContain('select=id,display_name,email');expect(path).not.toContain('&or=');
 const denied=response();await handler({...req(),method:'GET',url:'/api/accounts?action=users'},denied);expect(denied.statusCode).toBe(403);
});
it('searches names and email with paging and hides the recipient directory from pending accounts',async()=>{
 mock.requireUser.mockResolvedValue({id:'verified',access:{status:'active',roles:[],permissions:['binds.read']}});mock.db.mockResolvedValue(Array.from({length:51},(_,id)=>({id})));
 const res=response();await handler({...req(),method:'GET',url:'/api/accounts?action=users&purpose=share&page=2&search=Ivan'},res);
 expect(res.body.users).toHaveLength(50);expect(res.body.hasMore).toBe(true);expect(mock.db.mock.calls[0][1]).toContain('offset=50');expect(mock.db.mock.calls[0][1]).toContain('display_name.ilike.');expect(mock.db.mock.calls[0][1]).toContain('email.ilike.');
 mock.requireUser.mockResolvedValue({id:'pending',access:{status:'pending',roles:[],permissions:[]}});const denied=response();await handler({...req(),method:'GET',url:'/api/accounts?action=users&purpose=share'},denied);expect(denied.statusCode).toBe(403);
});
