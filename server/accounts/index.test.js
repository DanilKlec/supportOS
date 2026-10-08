import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const mock=vi.hoisted(()=>({requireUser:vi.fn(),changeAccess:vi.fn(),db:vi.fn(),allRows:vi.fn(),createUser:vi.fn(),signOut:vi.fn()}));
vi.mock('../_auth.js',()=>({requireUser:mock.requireUser}));
vi.mock('../_rbac.js',()=>({changeAccess:mock.changeAccess}));
vi.mock('../agent-monitor/_server.js',()=>({config:()=>({SUPABASE_URL:'https://test.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test'}),db:mock.db,allRows:mock.allRows}));
vi.mock('@supabase/supabase-js',()=>({createClient:()=>({auth:{admin:{createUser:mock.createUser,signOut:mock.signOut}}})}));
import handler from './index.js';
const response=()=>({setHeader(){},end(text){this.body=JSON.parse(text);}});
const req=(body)=>({method:'POST',url:'/api/accounts',headers:{origin:'https://app.test',host:'app.test'},body});
const historyUser='11111111-1111-4111-8111-111111111111',historyOther='22222222-2222-4222-8222-222222222222';
beforeEach(()=>{vi.resetAllMocks();mock.requireUser.mockResolvedValue({id:'verified',access:{status:'active',roles:[{id:'admin',name:'Admin'}],permissions:['work','users.manage','roles.manage']}});});
afterEach(()=>vi.unstubAllGlobals());
it('passes only the verified actor to transactional permission changes',async()=>{
 mock.requireUser.mockResolvedValue({id:historyUser,sessionId:'verified-session',access:{status:'active',roles:[],permissions:['users.manage']}});
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({ok:true})));
 const res=response(),payload={id:historyOther,roles:['support'],status:'active',version:1},confirmation={id:historyOther,token:'a'.repeat(43)};
 await handler(req({action:'user.update',payload,actor:'forged',session_id:'forged',confirmation}),res);
 expect(mock.changeAccess).not.toHaveBeenCalled();expect(res.statusCode).toBe(200);
 expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({actor:historyUser,sid:'verified-session',operation:'user.update',payload,request_id:historyOther,permit_digest:expect.any(String)});
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
it('attaches only the verified creation reference to Auth metadata, preserving partial role-setup failures',async()=>{
 mock.requireUser.mockResolvedValue({id:historyUser,sessionId:'verified-session',access:{status:'active',roles:[],permissions:['users.manage']}});
 mock.allRows.mockImplementation(async(_env,path)=>path.startsWith('supportos_roles?')?[{id:'support',name:'Support'}]:[]);
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({ok:true})));
 mock.createUser.mockResolvedValue({data:{user:{id:historyOther}},error:null});mock.changeAccess.mockRejectedValue(new Error('synthetic role failure'));
 const confirmation={id:historyOther,token:'a'.repeat(43)},res=response();
 await handler(req({action:'create',email:'created@example.test',password:'synthetic-long-password',roles:['support'],confirmation,
  actor:'forged',app_metadata:{supportos_creation_request:'forged',secret:'synthetic-secret'}}),res);
 expect(res.statusCode).toBe(201);expect(res.body).toMatchObject({id:historyOther,warning:expect.any(String)});
 expect(mock.createUser).toHaveBeenCalledWith({email:'created@example.test',password:'synthetic-long-password',email_confirm:true,
  app_metadata:{supportos_creation_request:confirmation.id}});
 expect(mock.changeAccess).toHaveBeenCalledWith(historyUser,'user.update',expect.objectContaining({id:historyOther}));
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
it('lists only the verified user sessions without requiring account management or accepting target overrides',async()=>{
 mock.requireUser.mockResolvedValue({id:'verified',sessionId:'current',access:{status:'active',roles:[],permissions:['work']}});
 mock.db.mockResolvedValue({sessions:[{id:'current',created_at:'2026-10-07T12:00:00Z',updated_at:null,refreshed_at:'2026-10-07T13:00:00Z',user_agent:'Browser',is_current:false,access_token:'secret-access',refresh_token:'secret-refresh',refresh_token_hmac_key:'secret-key',ip:'192.0.2.1',user_id:'verified'},{id:'other',is_current:true}]});
 const res=response();await handler({...req(),method:'GET',url:'/api/accounts?action=sessions&user_id=forged&subject=forged&sid=forged'},res);
 expect(res.statusCode).toBe(200);
 expect(mock.db).toHaveBeenCalledWith(expect.anything(),'rpc/supportos_list_own_sessions',{subject:'verified',sid:'current'});
 expect(res.body).toEqual({sessions:[{id:'current',created_at:'2026-10-07T12:00:00Z',updated_at:null,refreshed_at:'2026-10-07T13:00:00Z',user_agent:'Browser',is_current:true},{id:'other',created_at:null,updated_at:null,refreshed_at:null,user_agent:null,is_current:false}]});
 expect(JSON.stringify(res.body)).not.toMatch(/secret-|refresh_token|access_token|192\.0\.2\.1|user_id/);
});
it.each([401,403])('does not read sessions when the existing identity/2FA gate returns %s',async(status)=>{
 mock.requireUser.mockRejectedValue(Object.assign(new Error('Вход недоступен'),{status}));
 const res=response();await handler({...req(),method:'GET',url:'/api/accounts?action=sessions'},res);
 expect(res.statusCode).toBe(status);expect(mock.db).not.toHaveBeenCalled();
});
it.each(['pending','disabled'])('does not list sessions for a %s account',async(status)=>{
 mock.requireUser.mockResolvedValue({id:'verified',sessionId:'current',access:{status,roles:[],permissions:['work']}});
 const res=response();await handler({...req(),method:'GET',url:'/api/accounts?action=sessions'},res);
 expect(res.statusCode).toBe(403);expect(mock.db).not.toHaveBeenCalled();
});
it('fails closed for a missing or concurrently revoked current session',async()=>{
 const missing=response();await handler({...req(),method:'GET',url:'/api/accounts?action=sessions'},missing);
 expect(missing.statusCode).toBe(401);expect(mock.db).not.toHaveBeenCalled();
 mock.requireUser.mockResolvedValue({id:'verified',sessionId:'current',access:{status:'active',roles:[],permissions:['work']}});
 mock.db.mockResolvedValue({error:'invalid_session'});
 const revoked=response();await handler({...req(),method:'GET',url:'/api/accounts?action=sessions'},revoked);
 expect(revoked.statusCode).toBe(401);expect(revoked.body).toEqual({error:'Сессия недействительна. Войдите снова.'});
});
it('does not cache session metadata and rejects unexpected storage responses',async()=>{
 mock.requireUser.mockResolvedValue({id:'verified',sessionId:'current',access:{status:'active',roles:[],permissions:['work']}});
 mock.db.mockResolvedValue({unexpected:'data'});
 const res={...response(),setHeader:vi.fn()};await handler({...req(),method:'GET',url:'/api/accounts?action=sessions'},res);
 expect(res.setHeader).toHaveBeenCalledWith('Cache-Control','private, no-store');expect(res.statusCode).toBe(502);
});
it('returns safe own history using the verified identity and an opaque cursor',async()=>{
 mock.requireUser.mockResolvedValue({id:historyUser,sessionId:'verified-session',access:{status:'active',roles:[],permissions:['work']}});
 mock.db.mockResolvedValue({events:[{id:'12',session_id:'old',event_type:'login_approved',created_at:'2026-10-07T10:00:00Z',browser:'Chrome',os:'Windows',ip_hash:'a'.repeat(64),telegram_result:'approved',user_agent:'synthetic-raw-agent',refresh_token:'synthetic-refresh',ip:'192.0.2.1',event_ref:'private-ref'}],nextCursor:'12'});
 const res=response();await handler({...req(),method:'GET',url:'/api/accounts?action=login-history&actor=forged&before=20'},res);
 expect(res.statusCode).toBe(200);expect(mock.db).toHaveBeenCalledWith(expect.anything(),'rpc/supportos_login_history',{actor:historyUser,actor_session:'verified-session',target:historyUser,before_id:'20'});
 expect(res.body.events[0]).toMatchObject({user_id:historyUser,event_type:'login_approved',telegram_result:'approved'});
 expect(res.body.nextCursor).toBe('12');expect(JSON.stringify(res.body)).not.toMatch(/synthetic-|192\.0\.2|event_ref/);
});
it('requires users.manage to read another user history, regardless of role label',async()=>{
 mock.requireUser.mockResolvedValue({id:historyUser,sessionId:'verified-session',access:{status:'active',roles:[{id:'admin'}],permissions:['work']}});
 const denied=response();await handler({...req(),method:'GET',url:'/api/accounts?action=login-history&target='+historyOther},denied);
 expect(denied.statusCode).toBe(403);expect(mock.db).not.toHaveBeenCalled();
 mock.requireUser.mockResolvedValue({id:historyUser,sessionId:'verified-session',access:{status:'active',roles:[],permissions:['users.manage']}});mock.db.mockResolvedValue({events:[],nextCursor:null});
 const allowed=response();await handler({...req(),method:'GET',url:'/api/accounts?action=login-history&target='+historyOther},allowed);
 expect(allowed.statusCode).toBe(200);expect(mock.db.mock.calls[0][2].target).toBe(historyOther);
});
it.each(['','-1','nope','9223372036854775808'])('rejects invalid history cursor %s before reading the database',async(before)=>{
 mock.requireUser.mockResolvedValue({id:historyUser,sessionId:'verified-session',access:{status:'active',roles:[],permissions:['work']}});
 const res=response();await handler({...req(),method:'GET',url:'/api/accounts?action=login-history&before='+before},res);
 expect(res.statusCode).toBe(400);expect(mock.db).not.toHaveBeenCalled();
});
it.each([['invalid_session',401],['forbidden',403]])('honors the history RPC %s gate on concurrent changes',async(error,status)=>{
 mock.requireUser.mockResolvedValue({id:historyUser,sessionId:'verified-session',access:{status:'active',roles:[],permissions:['work']}});mock.db.mockResolvedValue({error});
 const res=response();await handler({...req(),method:'GET',url:'/api/accounts?action=login-history'},res);expect(res.statusCode).toBe(status);
});
it('requires generic confirmation for role changes and disabling an account, without falling back to unguarded RBAC',async()=>{
 mock.requireUser.mockResolvedValue({id:historyUser,sessionId:'verified-session',access:{status:'active',roles:[],permissions:['users.manage','roles.manage']}});
 for(const body of [{action:'user.update',payload:{id:historyOther,roles:['support'],status:'disabled',version:1}},{action:'role.save',payload:{id:'custom',permissions:['work']}},{action:'role.delete',payload:{id:'custom'}}]) {
  const res=response();await handler(req(body),res);expect(res.statusCode).toBe(428);expect(res.body.code).toBe('critical_confirmation_required');
 }
 expect(mock.changeAccess).not.toHaveBeenCalled();expect(mock.db).not.toHaveBeenCalled();
});
it('revokes only others with the verified JWT after consuming confirmation and verifies DB completion',async()=>{
 mock.requireUser.mockResolvedValue({id:historyUser,sessionId:'verified-session',access:{status:'active',roles:[],permissions:['work']}});
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({ok:true})));mock.signOut.mockResolvedValue({error:null});mock.db.mockResolvedValue({ok:true});
 const res=response();await handler({...req({confirmation:{id:historyOther,token:'a'.repeat(43)},actor:'forged',target:'forged'}),url:'/api/accounts?action=revoke-other-sessions',headers:{...req().headers,authorization:'Bearer verified-jwt'}},res);
 expect(res.statusCode).toBe(200);expect(mock.signOut).toHaveBeenCalledWith('verified-jwt','others');
 expect(mock.db).toHaveBeenCalledWith(expect.anything(),'rpc/supportos_critical_sessions_completed',{actor:historyUser,sid:'verified-session',request_id:historyOther});
});
it('does not revoke sessions with rejected proof or report success after provider failure',async()=>{
 mock.requireUser.mockResolvedValue({id:historyUser,sessionId:'verified-session',access:{status:'active',roles:[],permissions:['work']}});
 const request={...req({confirmation:{id:historyOther,token:'a'.repeat(43)}}),url:'/api/accounts?action=revoke-other-sessions',headers:{...req().headers,authorization:'Bearer verified-jwt'}};
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({error:'not_approved'})));
 const denied=response();await handler(request,denied);expect(denied.statusCode).toBe(428);expect(mock.signOut).not.toHaveBeenCalled();
 fetch.mockResolvedValue(Response.json({ok:true}));mock.signOut.mockResolvedValue({error:{status:500}});
 const failed=response();await handler(request,failed);expect(failed.statusCode).toBe(503);expect(mock.db).not.toHaveBeenCalled();
});
it('does not create an Auth account or assign initial roles without Telegram confirmation',async()=>{
 mock.requireUser.mockResolvedValue({id:historyUser,sessionId:'verified-session',access:{status:'active',roles:[],permissions:['users.manage','work']}});
 mock.allRows.mockImplementation(async(_env,path)=>path.startsWith('supportos_roles?')?[{id:'support'}]:path.startsWith('supportos_permissions?')?[{id:'work'}]:[{role_id:'support',permission_id:'work'}]);
 const res=response();await handler(req({action:'create',email:'new@example.test',password:'synthetic-long-password',roles:['support']}),res);
 expect(res.statusCode).toBe(428);expect(mock.createUser).not.toHaveBeenCalled();expect(mock.changeAccess).not.toHaveBeenCalled();
});
