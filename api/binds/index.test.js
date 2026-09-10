import {beforeEach,afterEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({requireUser:vi.fn(),db:vi.fn(),allRows:vi.fn()}));
vi.mock('../_auth.js',()=>({requireUser:mocks.requireUser}));
vi.mock('../agent-monitor/_server.js',()=>({...mocks,config:()=>({SUPABASE_URL:'https://example.test',SUPABASE_SERVICE_ROLE_KEY:'test'})}));
import handler from './index.js';
const actor='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
beforeEach(()=>{vi.resetAllMocks();mocks.requireUser.mockResolvedValue({id:actor,access:{status:'active',permissions:['binds.read']}});});
afterEach(()=>vi.unstubAllGlobals());
async function run(req){const res={setHeader:vi.fn(),end:vi.fn(),statusCode:0};await handler({method:'GET',url:'/api/binds',headers:{host:'app.test',origin:'https://app.test'},...req},res);return {status:res.statusCode,data:JSON.parse(res.end.mock.calls[0][0])};}
it('rejects another employee bind read and account search without bind management',async()=>{expect((await run({url:`/api/binds?user_id=${other}`})).status).toBe(403);expect((await run({url:'/api/binds?action=users'})).status).toBe(403);expect(mocks.allRows).not.toHaveBeenCalled();});
it('uses verified actor even when the request includes a forged actor',async()=>{const fetch=vi.fn(async()=>new Response(JSON.stringify({id:'personal'})));vi.stubGlobal('fetch',fetch);expect((await run({method:'POST',body:{action:'save',actor:other,userId:actor,sourceId:'common',translations:[],tags:[]}})).status).toBe(200);expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({actor,target:actor});});
it('returns conflicts without reporting a successful save',async()=>{vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({code:'40001',message:'Версия уже изменена'}),{status:400})));expect((await run({method:'POST',body:{action:'reset',userId:actor,sourceId:'common',expected:'old'}})).status).toBe(409);});
it('rejects a cross-origin mutation before authorization',async()=>{expect((await run({method:'POST',headers:{host:'app.test',origin:'https://evil.test'}})).status).toBe(403);expect(mocks.requireUser).not.toHaveBeenCalled();});
