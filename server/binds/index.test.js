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
it('declines as the authenticated recipient and ignores forged recipient and actor fields',async()=>{
 const fetch=vi.fn(async()=>new Response(JSON.stringify({code:'42501',message:'Нет доступа к этой полученной версии'}),{status:403}));vi.stubGlobal('fetch',fetch);
 const result=await run({method:'POST',body:{action:'decline',shareId:'another-share',actor:other,userId:other,recipient_id:other}});
 expect(result.status).toBe(403);
 expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({actor,operation:'decline',payload:{shareId:'another-share'}});
 expect(mocks.requireUser).toHaveBeenCalledWith(expect.anything(),{permission:'binds.read'});
});

it('returns only proposal outcomes addressed to the verified actor',async()=>{mocks.db.mockResolvedValue([{id:'p',source_id:'common',status:'accepted',resolved_at:'2026-09-12',translations:[{title:'Answer',content:'Private text'}]}]);const result=await run({url:`/api/binds?action=proposal-results&user_id=${other}`});expect(result.status).toBe(200);expect(mocks.db.mock.calls[0][1]).toContain(`author_id=eq.${actor}`);expect(mocks.db.mock.calls[0][1]).not.toContain(other);expect(result.data[0]).toEqual({id:'p',sourceId:'common',status:'accepted',resolvedAt:'2026-09-12',title:'Answer'});});

it('pages shared binds through the authenticated server API',async()=>{
 const row={id:'common',owner_id:null,slug:'common',category_id:'shared',translations:[],tags:[],created_at:'2026-01-01',updated_at:'2026-01-01'};
 mocks.db.mockResolvedValue([row]);
 const result=await run({url:'/api/binds?action=shared&limit=250&offset=500'});
 expect(result).toEqual({status:200,data:{rows:[row]}});
 expect(mocks.db).toHaveBeenCalledWith(expect.anything(),'supportos_binds?select=*&owner_id=is.null&order=id.asc&limit=250&offset=500');
});

it('requires knowledge write permission for shared bind mutations',async()=>{
 const result=await run({method:'POST',body:{action:'shared-save',translations:[{language:'ru',title:'Ответ',content:'Текст'}],tags:[]}});
 expect(result.status).toBe(403);
 expect(result.data.error).toContain('Нет права');
});

it('updates a shared bind with an atomic timestamp guard',async()=>{
 mocks.requireUser.mockResolvedValue({id:actor,access:{status:'active',permissions:['binds.read','knowledge.write']}});
 const row={id:'common',owner_id:null,slug:'common',category_id:'shared',translations:[{language:'ru',title:'Ответ',content:'Текст'}],tags:['tag'],created_at:'2026-01-01',updated_at:'2026-09-25'};
 const fetch=vi.fn(async()=>new Response(JSON.stringify([row])));vi.stubGlobal('fetch',fetch);
 const result=await run({method:'POST',body:{action:'shared-save',id:'common',expected:'2026-09-10T10:00:00Z',translations:[{language:'ru',title:' Ответ ',content:' Текст '}],tags:['tag']}});
 expect(result).toEqual({status:200,data:row});
 expect(fetch.mock.calls[0][0]).toContain('supportos_binds?id=eq.common&owner_id=is.null&updated_at=eq.2026-09-10T10%3A00%3A00Z&select=*');
 expect(fetch.mock.calls[0][1]).toMatchObject({method:'PATCH'});
 expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({translations:[{language:'ru',title:'Ответ',content:'Текст',updatedAt:expect.any(String)}],tags:['tag'],updated_at:expect.any(String)});
});

it('returns 409 when a shared bind timestamp no longer matches',async()=>{
 mocks.requireUser.mockResolvedValue({id:actor,access:{status:'active',permissions:['binds.read','knowledge.write']}});
 vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify([]))));
 const result=await run({method:'POST',body:{action:'shared-save',id:'common',expected:'2026-09-10T10:00:00Z',translations:[{language:'ru',title:'Ответ',content:'Текст'}],tags:[]}});
 expect(result.status).toBe(409);
 expect(result.data.error).toContain('Бинд изменён другим сотрудником');
});

it('creates shared binds in the selected shared section/folder/color, ignoring a forged owner',async()=>{
 mocks.requireUser.mockResolvedValue({id:actor,access:{status:'active',permissions:['binds.read','knowledge.write']}});
 mocks.db.mockResolvedValue([{id:'allowed'}]);
 const fetch=vi.fn(async()=>Response.json([{id:'new',owner_id:null,category_id:'chosen',folder_id:'folder',color:'#10B981'}]));vi.stubGlobal('fetch',fetch);
 const result=await run({method:'POST',body:{action:'shared-save',ownerId:other,categoryId:'chosen',folderId:'folder',color:'#10B981',translations:[{language:'ru',title:'Ответ',content:'Текст'}],tags:[]}});
 expect(result.status).toBe(200);
 expect(mocks.db.mock.calls.map(([,path])=>path)).toEqual(['supportos_categories?select=id&id=eq.chosen&owner_id=is.null','supportos_folders?select=id&id=eq.folder&category_id=eq.chosen&owner_id=is.null']);
 expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({owner_id:null,category_id:'chosen',folder_id:'folder',color:'#10B981'});
});
it.each([
 {categoryId:'private',folderId:null},
 {categoryId:'shared',folderId:'wrong-folder'},
 {categoryId:'shared'},
 {folderId:'folder'},
 {color:'url(secret)'},
 {color:'#12345'},
])('rejects invalid or inaccessible shared locations/colors before any write (%j)',async metadata=>{
 mocks.requireUser.mockResolvedValue({id:actor,access:{status:'active',permissions:['binds.read','knowledge.write']}});
 mocks.db.mockImplementation(async(_env,path)=>path.startsWith('supportos_categories')&&path.includes('id=eq.shared')?[{id:'shared'}]:[]);
 const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
 expect((await run({method:'POST',body:{action:'shared-save',...metadata,translations:[{language:'ru',title:'Ответ',content:'Текст'}],tags:[]}})).status).toBe(400);
 expect(fetch).not.toHaveBeenCalled();
});
it('clears location/color intentionally with null while preserving the optimistic conflict guard',async()=>{
 mocks.requireUser.mockResolvedValue({id:actor,access:{status:'active',permissions:['binds.read','knowledge.write']}});
 mocks.db.mockResolvedValue([{id:'shared'}]);
 const fetch=vi.fn(async()=>Response.json([]));vi.stubGlobal('fetch',fetch);
 const result=await run({method:'POST',body:{action:'shared-save',id:'common',expected:'old',categoryId:'shared',folderId:null,color:null,translations:[{language:'ru',title:'Ответ',content:'Текст'}],tags:[]}});
 expect(result.status).toBe(409);
 expect(fetch.mock.calls[0][0]).toContain('owner_id=is.null&updated_at=eq.old');
 expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({category_id:'shared',folder_id:null,color:null});
});

it('loads the runtime knowledge snapshot from server tables and applies personal overrides',async()=>{
 mocks.allRows.mockImplementation(async(_env,path)=>{
  if(path.startsWith('supportos_categories'))return [{id:'shared',owner_id:null,name:'Общее',icon:null,color:null,order_index:1}];
  if(path.startsWith('supportos_folders'))return [];
  if(path.startsWith('supportos_binds'))return [
   {id:'base',owner_id:null,source_bind_id:null,slug:'base',category_id:'shared',folder_id:null,tags:[],translations:[],favorite:false,archived:false,created_at:'2026-01-01',updated_at:'2026-01-01'},
   {id:'personal',owner_id:actor,source_bind_id:'base',slug:'personal',category_id:'shared',folder_id:null,tags:[],translations:[],favorite:true,archived:false,created_at:'2026-01-02',updated_at:'2026-01-02'},
  ];
  return [];
 });
 mocks.db.mockImplementation(async(_env,path)=>path.startsWith('supportos_bind_history')?[{id:2,source_id:'base',owner_id:actor,snapshot:{slug:'personal-old',tags:['old'],translations:[],updated_at:'2026-01-01'},created_at:'2026-01-01'}]:[]);
 const result=await run({url:'/api/binds?action=knowledge'});
 expect(result.status).toBe(200);
 expect(result.data.categories).toEqual([{id:'shared',ownerId:null,name:'Общее',order:1}]);
 expect(result.data.binds).toHaveLength(1);
 expect(result.data.binds[0]).toMatchObject({id:'personal',ownerId:actor,sourceBindId:'base',favorite:true});
 expect(result.data.binds[0].history).toEqual([{id:'2',createdAt:'2026-01-01',slug:'personal-old',tags:['old'],translations:[]}]);
 expect(mocks.allRows.mock.calls.every(([,path])=>path.includes(`owner_id.eq.${actor}`))).toBe(true);
});

it('persists knowledge through the server and never accepts a forged owner',async()=>{
 mocks.db.mockResolvedValue([]);
 const fetch=vi.fn(async()=>new Response('',{status:201}));vi.stubGlobal('fetch',fetch);
 const result=await run({method:'POST',body:{action:'knowledge-save',categories:[{id:'mine',ownerId:other,name:'Личное',order:1}]}});
 expect(result.status).toBe(200);
 const saved=JSON.parse(fetch.mock.calls[0][1].body);
 expect(saved[0]).toMatchObject({id:'mine',owner_id:actor,name:'Личное'});
 expect((await run({method:'POST',body:{action:'knowledge-save',categories:[{id:'shared',ownerId:null,name:'Общее',order:1}]}})).status).toBe(403);
});

const backup={app:'SupportOS',version:3,knowledge:{categories:[{id:'shared',ownerId:null,name:'Общее',order:1},{id:'new',ownerId:null,name:'Новое',order:2}],folders:[],binds:[]}};
function allowBackup(){mocks.requireUser.mockResolvedValue({id:actor,access:{status:'active',permissions:['binds.read','knowledge.write']}});mocks.allRows.mockImplementation(async(_env,path)=>path.startsWith('supportos_categories')?[{id:'shared',owner_id:null,name:'Сервер',order_index:1}]:[]);mocks.db.mockImplementation(async(_env,path)=>path.startsWith('supportos_categories?select=id')?[{id:'shared',owner_id:null,updated_at:'2026-01-01'}]:[]);}
it('exports only the authorized server snapshot, not browser state',async()=>{
 allowBackup();const result=await run({url:'/api/binds?action=backup-export'});
 expect(result.status).toBe(200);expect(result.data).toMatchObject({app:'SupportOS',version:3,scope:'authorized-knowledge',knowledge:{categories:[{id:'shared',name:'Сервер'}],folders:[],binds:[]}});
 expect(mocks.allRows.mock.calls.every(([,path])=>path.includes(`owner_id.eq.${actor}`))).toBe(true);
});
it('includes shared binds even when a personal branch shadows them in the runtime cache',async()=>{
 allowBackup();mocks.allRows.mockImplementation(async(_env,path)=>path.startsWith('supportos_binds')?[
  {id:'base',owner_id:null,slug:'base',category_id:'shared',tags:[],translations:[],created_at:'2026-01-01',updated_at:'2026-01-01'},
  {id:'branch',owner_id:actor,source_bind_id:'base',slug:'branch',category_id:'shared',tags:[],translations:[],created_at:'2026-01-01',updated_at:'2026-01-01'},
 ]:[]);
 const result=await run({url:'/api/binds?action=backup-export'});
 expect(result.data.knowledge.binds.map(item=>item.id)).toEqual(['base','branch']);
 expect(result.data.knowledge.binds[0]).not.toHaveProperty('history');
});
it('previews merge/upsert counts and never writes during preview',async()=>{
 allowBackup();const result=await run({method:'POST',body:{action:'backup-preview',payload:backup}});
 expect(result.status).toBe(200);expect(result.data.counts.categories).toEqual({add:1,existing:1});expect(result.data.token).toMatch(/^[a-f0-9]{64}$/);expect(mocks.db.mock.calls.every(([,path])=>!path.includes('on_conflict'))).toBe(true);
});
it('requires a fresh preview and writes only missing records in merge mode',async()=>{
 allowBackup();const preview=await run({method:'POST',body:{action:'backup-preview',payload:backup}});
 expect((await run({method:'POST',body:{action:'backup-apply',payload:backup,mode:'merge',token:'stale'}})).status).toBe(409);
 const fetch=vi.fn(async()=>new Response('',{status:201}));vi.stubGlobal('fetch',fetch);
 const result=await run({method:'POST',body:{action:'backup-apply',payload:backup,mode:'merge',token:preview.data.token}});
 expect(result.status).toBe(200);expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject([{id:'new',name:'Новое'}]);
 expect(JSON.parse(fetch.mock.calls[0][1].body)).not.toContainEqual(expect.objectContaining({id:'shared'}));
});
it('rejects import without write permission or with an incomplete parent reference',async()=>{
 const denied=await run({method:'POST',body:{action:'backup-preview',payload:backup}});expect(denied.status).toBe(403);
 allowBackup();const invalid={app:'SupportOS',version:3,knowledge:{categories:[],folders:[{id:'orphan',categoryId:'missing',name:'Папка',order:1}],binds:[]}};
 expect((await run({method:'POST',body:{action:'backup-preview',payload:invalid}})).status).toBe(400);
});
it('upserts existing IDs only after explicit preview and rejects stale DB state',async()=>{
 allowBackup();const preview=await run({method:'POST',body:{action:'backup-preview',payload:backup}});
 mocks.db.mockImplementation(async(_env,path)=>path.startsWith('supportos_categories?select=id')?[{id:'shared',owner_id:null,updated_at:'2026-02-01'}]:[]);
 expect((await run({method:'POST',body:{action:'backup-apply',payload:backup,mode:'upsert',token:preview.data.token}})).status).toBe(409);
 allowBackup();const fetch=vi.fn(async()=>new Response('',{status:201}));vi.stubGlobal('fetch',fetch);
 expect((await run({method:'POST',body:{action:'backup-apply',payload:backup,mode:'upsert',token:preview.data.token}})).status).toBe(200);
 expect(JSON.parse(fetch.mock.calls[0][1].body)).toHaveLength(2);
});
it('keeps ownerless legacy records personal instead of publishing them to the team',async()=>{
 allowBackup();const legacy={categories:[{id:'legacy',name:'Личное',order:1}],folders:[],binds:[]};
 const preview=await run({method:'POST',body:{action:'backup-preview',payload:legacy}});
 const fetch=vi.fn(async()=>new Response('',{status:201}));vi.stubGlobal('fetch',fetch);
 expect((await run({method:'POST',body:{action:'backup-apply',payload:legacy,mode:'merge',token:preview.data.token}})).status).toBe(200);
 expect(JSON.parse(fetch.mock.calls[0][1].body)[0].owner_id).toBe(actor);
});
