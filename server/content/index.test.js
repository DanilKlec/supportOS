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
});
it('allows readers and returns an unpublished document as null',async()=>{
 mocks.db.mockResolvedValue([]);expect((await run({})).data).toBe(null);expect(mocks.requireUser.mock.calls[0][1]).toEqual({permission:'projects.read'});
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
