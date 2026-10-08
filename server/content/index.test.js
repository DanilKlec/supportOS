import {beforeEach,afterEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({requireUser:vi.fn(),db:vi.fn()}));
vi.mock('../_auth.js',()=>({requireUser:mocks.requireUser}));
vi.mock('../agent-monitor/_server.js',()=>({...mocks,config:()=>({SUPABASE_URL:'https://example.test',SUPABASE_SERVICE_ROLE_KEY:'test'})}));
import handler from './index.js';
beforeEach(()=>{vi.resetAllMocks();mocks.requireUser.mockResolvedValue({id:'verified'});});
afterEach(()=>vi.unstubAllGlobals());
async function run(req){const res={setHeader:vi.fn(),end:vi.fn(),statusCode:0};await handler({method:'GET',url:'/api/content?dataset=emails',headers:{host:'app.test',origin:'https://app.test'},...req},res);return {status:res.statusCode,data:JSON.parse(res.end.mock.calls[0][0])};}
it('requires email write permission and ignores forged actors',async()=>{
 const fetch=vi.fn(async()=>new Response(JSON.stringify({version:1})));vi.stubGlobal('fetch',fetch);
 expect((await run({method:'POST',body:{dataset:'emails',data:[],expected:0,actor:'forged'}})).status).toBe(200);
 expect(mocks.requireUser.mock.calls[0][1]).toEqual({permission:'projects.write'});
 expect(JSON.parse(fetch.mock.calls[0][1].body).actor).toBe('verified');
 expect(fetch.mock.calls[0][0]).toContain('supportos_publish_normalized_content');
});
it('allows readers and returns an unpublished document as null',async()=>{
 mocks.db.mockResolvedValue([]);expect((await run({})).data).toBe(null);expect(mocks.requireUser.mock.calls[0][1]).toEqual({permission:'projects.read'});
});
it('builds the legacy frontend shape from normalized rows without reading legacy data',async()=>{
 mocks.db.mockImplementation(async(_env,path)=>{
  if(path.startsWith('supportos_content_revisions'))return [{id:'emails',version:7,updated_at:'2026-09-25T10:00:00Z',updated_by:'editor'}];
 if(path.startsWith('supportos_project_emails'))return [{id:'mail-1',project_id:'project-1',type:'Support',email:'help@example.com',note:null,sort_order:2,updated_at:'2026-09-25T09:00:00Z'}];
  if(path.startsWith('supportos_projects'))return [{id:'project-1',name:'Example',slug:'example',source_hash:'hash',updated_at:'2026-09-25T09:00:00Z'}];
  throw new Error(`Unexpected path: ${path}`);
 });
 const response=await run({});
 expect(response.data).toMatchObject({id:'emails',version:7,data:[{id:'project-1',projectName:'Example',supportEmail:'help@example.com'}]});
 expect(response.data.data[0].addresses).toEqual([{id:'mail-1',type:'Support',email:'help@example.com',order:0}]);
 expect(mocks.db.mock.calls.some(([,path])=>path.startsWith('supportos_shared_content'))).toBe(false);
});
it.each(['emails','bonuses','bonus-tools'])('reads the DB transition document for %s only when normalized tables are missing',async(dataset)=>{
 const legacy={id:dataset,version:3,data:[],updated_at:'2026-10-08T00:00:00Z'};
 mocks.db.mockImplementation(async(_env,path)=>{
  if(path.startsWith('supportos_shared_content'))return [legacy];
  throw Object.assign(new Error('Missing table'),{status:502,storageStatus:404,storageCode:'PGRST205'});
 });
 expect(await run({url:`/api/content?dataset=${dataset}`})).toEqual({status:200,data:legacy});
 expect(mocks.db.mock.calls.every(([,path])=>!path.startsWith('rpc/'))).toBe(true);
});
it.each([401,403,429,500])('does not hide storage status %s with a legacy fallback',async(storageStatus)=>{
 mocks.db.mockRejectedValue(Object.assign(new Error('Storage unavailable'),{status:502,storageStatus,storageCode:'42501'}));
 expect((await run({})).status).toBe(502);
 expect(mocks.db.mock.calls.some(([,path])=>path.startsWith('supportos_shared_content'))).toBe(false);
});
it('never falls back over existing normalized data when its dependencies are missing',async()=>{
 mocks.db.mockImplementation(async(_env,path)=>{
  if(path.startsWith('supportos_content_revisions'))return [];
  if(path.startsWith('supportos_project_emails'))return [{id:'normalized',project_id:'project-1'}];
  throw Object.assign(new Error('Missing dependency'),{status:502,storageStatus:404,storageCode:'PGRST205'});
 });
 expect((await run({})).status).toBe(502);
 expect(mocks.db.mock.calls.some(([,path])=>path.startsWith('supportos_shared_content'))).toBe(false);
});
it('keeps normalized rows authoritative even before the revision migration',async()=>{
 mocks.db.mockImplementation(async(_env,path)=>{
  if(path.startsWith('supportos_content_revisions'))throw Object.assign(new Error('Missing revision table'),{status:502,storageStatus:404,storageCode:'PGRST205'});
  if(path.startsWith('supportos_project_emails'))return [{id:'mail-1',project_id:'project-1',type:'Support',email:'help@example.com',sort_order:0}];
  if(path.startsWith('supportos_projects'))return [{id:'project-1',name:'Example',slug:'example'}];
  throw new Error('Unexpected legacy access');
 });
 expect((await run({})).data.data[0].addresses[0].id).toBe('mail-1');
 expect(mocks.db.mock.calls.some(([,path])=>path.startsWith('supportos_shared_content'))).toBe(false);
});
it('adapts ordered addresses to the existing normalized publish RPC',async()=>{
 const fetch=vi.fn(async()=>new Response(JSON.stringify({version:1})));vi.stubGlobal('fetch',fetch);
 const record={id:'project-1',slug:'example',projectName:'Example',addresses:[
  {id:'second',type:'Complaints',email:'complaints@example.com',order:1},
  {id:'first',type:'Support',email:'help@example.com',order:0},
 ]};
 expect((await run({method:'POST',body:{dataset:'emails',data:[record],expected:0}})).status).toBe(200);
 const payload=JSON.parse(fetch.mock.calls[0][1].body).payload[0];
 expect(payload.addresses.map(row=>row.id)).toEqual(['first','second']);
 expect(payload.emails.map(row=>row.id)).toEqual(['first','second']);
 expect(payload.supportEmail).toBe('help@example.com');
});
it('isolates personal reads and writes using only the verified account',async()=>{
 mocks.db.mockResolvedValue([]);
 await run({url:'/api/content?dataset=bonuses&scope=personal&owner_id=forged'});
 expect(mocks.db.mock.calls[0][1]).toContain('owner_id=eq.verified');
 const fetch=vi.fn(async()=>new Response(JSON.stringify({version:1})));vi.stubGlobal('fetch',fetch);
 expect((await run({method:'POST',body:{dataset:'bonuses',data:[],scope:'personal',expected:0,actor:'forged',owner_id:'forged'}})).status).toBe(200);
 expect(mocks.requireUser.mock.calls.at(-1)[1]).toEqual({permission:'bonuses.read'});
 expect(JSON.parse(fetch.mock.calls[0][1].body).actor).toBe('verified');
 expect(fetch.mock.calls[0][0]).toContain('supportos_save_personal_content');
 expect((await run({method:'POST',body:{dataset:'emails',data:[],scope:'personal',expected:0}})).status).toBe(400);
});
it('rejects cross-origin writes, malformed records, revoked rights and conflicts',async()=>{
 expect((await run({method:'POST',headers:{host:'app.test',origin:'https://evil.test'},body:{dataset:'emails'}})).status).toBe(403);
 expect(mocks.requireUser).not.toHaveBeenCalled();
 expect((await run({method:'POST',body:{dataset:'emails',data:[{}],expected:0}})).status).toBe(400);
 mocks.requireUser.mockRejectedValueOnce(Object.assign(new Error('Forbidden'),{status:403}));
 expect((await run({method:'POST',body:{dataset:'emails',data:[],expected:0}})).status).toBe(403);
 vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({code:'40001',message:'Conflict'}),{status:400})));
 expect((await run({method:'POST',body:{dataset:'emails',data:[],expected:0}})).status).toBe(409);
});
