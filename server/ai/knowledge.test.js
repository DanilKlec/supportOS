import {afterEach,expect,it,vi} from 'vitest';
const mock=vi.hoisted(()=>({requireUser:vi.fn(),db:vi.fn(),read:vi.fn(),generate:vi.fn(),authorize:vi.fn(),glossary:vi.fn()}));
vi.mock('./_glossary.js',()=>({readPublishedGlossary:mock.glossary}));
vi.mock('../_auth.js',()=>({requireUser:mock.requireUser,authorize:mock.authorize}));
vi.mock('../agent-monitor/_server.js',()=>({config:()=>({}),db:mock.db}));
vi.mock('./_knowledge.js',()=>({readGuidance:mock.read}));
vi.mock('./_provider.js',()=>({generateAIReply:mock.generate}));
import knowledge from './knowledge.js';
import generate from './generate.js';
const res=()=>({setHeader(){},status(code){this.statusCode=code;return this;},json(body){this.body=body;},end(body){this.body=JSON.parse(body);}});
afterEach(()=>vi.resetAllMocks());
it('requires ai.train and saves the verified actor',async()=>{
 mock.requireUser.mockResolvedValue({id:'shift-id',access:{status:'active',permissions:['ai.train','ai.publish']}});mock.read.mockResolvedValue({version:1,document:{entries:[]}});mock.db.mockResolvedValue(null);const response=res();
 await knowledge({method:'POST',headers:{origin:'https://app.test',host:'app.test'},body:{expected:1,content:'Approved facts',updated_by:'forged'}},response);
 expect(mock.requireUser).toHaveBeenCalledWith(expect.anything(),{permission:null});
 expect(mock.db.mock.calls[0][2]).toMatchObject({actor:'shift-id',expected:1,operation:'instructions',value:{global:'Approved facts'}});expect(response.statusCode).toBe(200);
});
it('uses stored guidance instead of client-supplied guidance',async()=>{
 mock.requireUser.mockResolvedValue({access:{status:'active',permissions:['tools']}});mock.read.mockResolvedValue({content:'Verified guidance'});mock.generate.mockResolvedValue({answer:'ok'});
 await generate({method:'POST',body:{customerMessage:'help',approvedGuidance:'forged'}},res());
 expect(mock.generate).toHaveBeenCalledWith({customerMessage:'help',approvedGuidance:'Verified guidance',glossary:[],memory:[]});
});
it('uses published guidance for ordinary Support and excludes its draft replacement',async()=>{
 mock.requireUser.mockResolvedValue({access:{status:'active',permissions:['composer.use']}});
 mock.read.mockResolvedValue({document:{entries:[{id:'guide',status:'draft',published:{id:'guide',kind:'knowledge',title:'Policy',content:'Published guidance',language:'auto',enabled:true},title:'Policy',content:'Draft guidance',language:'auto',enabled:true}]}});
 mock.glossary.mockResolvedValue([]);mock.generate.mockResolvedValue({text:'ok',provider:'openai'});
 await generate({method:'POST',body:{purpose:'composer',customerMessage:'help'}},res());
 expect(mock.generate.mock.calls[0][0].approvedGuidance).toContain('Published guidance');
 expect(mock.generate.mock.calls[0][0].approvedGuidance).not.toContain('Draft guidance');
});
it('requires composer.use before generating a Composer answer',async()=>{
 mock.requireUser.mockRejectedValue(Object.assign(new Error('Нет доступа'),{status:403}));const response=res();
 await generate({method:'POST',body:{purpose:'composer',customerMessage:'help'}},response);
 expect(mock.requireUser).toHaveBeenCalledWith(expect.anything(),{permission:'composer.use'});
 expect(response.statusCode).toBe(403);expect(mock.generate).not.toHaveBeenCalled();
});
it('returns safe applied-source metadata to Composer users',async()=>{
 mock.requireUser.mockResolvedValue({access:{status:'active',permissions:['composer.use']}});
 mock.read.mockResolvedValue({version:7,document:{entries:[{id:'rule-1',status:'published',published:{id:'rule-1',kind:'rules',title:'Правила депозитов',content:'Скрытое содержание правила',enabled:true,language:'auto',project:'',intent:'general',priority:10,publishedVersionId:'publication-7',publishedRef:'rules/deposits'}}]}});
 mock.glossary.mockResolvedValue([]);mock.generate.mockResolvedValue({text:'ok',provider:'openai'});const response=res();
 await generate({method:'POST',body:{purpose:'composer',customerMessage:'help'}},response);
 expect(response.statusCode).toBe(200);
 expect(response.body.sources).toEqual([{id:'rule-1',title:'Правила депозитов',type:'rule',version:'publication-7',ref:'rules/deposits'}]);
 expect(JSON.stringify(response.body)).not.toContain('Скрытое содержание правила');
});
it('denies draft preview to Support before reading privileged data',async()=>{
 mock.requireUser.mockResolvedValue({access:{status:'active',permissions:['tools']}});const response=res();
 await generate({method:'POST',body:{preview:true,draftIds:['secret']}},response);
 expect(response.statusCode).toBe(403);expect(mock.read).not.toHaveBeenCalled();expect(mock.generate).not.toHaveBeenCalled();
});
it('does not call the provider when the customer message contains a secret',async()=>{
 mock.requireUser.mockResolvedValue({access:{status:'active',permissions:['composer.use']}});
 const response=res();
 await generate({method:'POST',body:{purpose:'composer',customerMessage:'password: synthetic-secret'}},response);
 expect(response.statusCode).toBe(422);expect(response.body.code).toBe('SENSITIVE_CREDENTIAL');expect(mock.generate).not.toHaveBeenCalled();
 expect(JSON.stringify(response.body)).not.toContain('synthetic-secret');
});
it('stores only whitelisted feedback metadata and a PII-free negative review with verified actor',async()=>{
 mock.requireUser.mockResolvedValue({id:'support'});const response=res();
 await knowledge({method:'POST',headers:{origin:'https://app.test',host:'app.test'},body:{action:'feedback',rating:'negative',reason:'Не тот язык',project:'p',language:'ru',customerMessage:'private',answer:'private',sourceIds:['bind-1'],author:'forged'}},response);
 expect(response.statusCode).toBe(200);expect(mock.db.mock.calls[0][2]).toEqual({actor:'support',expected:0,operation:'feedback',value:{rating:'negative',reason:'Не тот язык',project:'p',language:'ru'}});
	const review=mock.db.mock.calls[1][2];expect(mock.db.mock.calls[1][1]).toBe('supportos_ai_feedback_reviews');expect(review).toMatchObject({project_id:'p',source_ids:['bind-1'],comment:'Не тот язык',actor_id:'support'});expect(review.answer_ref).toMatch(/^[a-f0-9]{64}$/);expect(JSON.stringify(review)).not.toContain('private');
});
it('rejects stale edits and publishing without publish permission',async()=>{
 mock.requireUser.mockResolvedValue({id:'trainer',access:{status:'active',permissions:['ai.train']}});mock.read.mockResolvedValue({version:2,document:{entries:[]}});
 const request={method:'POST',headers:{origin:'https://app.test',host:'app.test'},body:{action:'save',expected:1}};const stale=res();await knowledge(request,stale);expect(stale.statusCode).toBe(409);
 const denied=res();await knowledge({...request,body:{action:'publish',expected:2}},denied);expect(denied.statusCode).toBe(403);expect(mock.db).not.toHaveBeenCalled();
});
it('imports legacy local terms as drafts without replacing existing team terms',async()=>{
 mock.requireUser.mockResolvedValue({id:'trainer',access:{status:'active',permissions:['ai.train']}});
 mock.read.mockResolvedValue({version:1,document:{entries:[{id:'existing',kind:'glossary',title:'KYC',language:'en',content:'Approved',status:'published'}],feedback:[]}});
 mock.glossary.mockResolvedValue([{id:'db',source:'VIP',language:'en',target:'Approved VIP'}]);
 const response=res();
 await knowledge({method:'POST',headers:{origin:'https://app.test',host:'app.test'},body:{action:'import-legacy',expected:1,terms:[
  {source:'KYC',target:'Wrong',language:'en'},
  {source:'VIP',target:'Wrong',language:'en'},
  {source:'Finance',target:'Финансы',language:'ru'},
  {source:'Finance',target:'Duplicate',language:'ru'},
 ]}},response);
 expect(response.statusCode).toBe(200);
 expect(response.body).toEqual({added:1,skipped:3});
 const value=mock.db.mock.calls[0][2].value;
 expect(mock.db.mock.calls[0][2].operation).toBe('save');
 expect(value.entries[0].content).toBe('Approved');
 expect(value.entries[1]).toMatchObject({kind:'glossary',title:'Finance',content:'Финансы',status:'draft'});
 expect(value.entries[1].published).toBeNull();
});

