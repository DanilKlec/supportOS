import {afterEach,expect,it,vi} from 'vitest';
const mock=vi.hoisted(()=>({requireUser:vi.fn(),db:vi.fn(),read:vi.fn(),generate:vi.fn(),authorize:vi.fn()}));
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
 expect(mock.generate).toHaveBeenCalledWith({customerMessage:'help',approvedGuidance:'Verified guidance',glossary:[]});
});
it('denies draft preview to Support before reading privileged data',async()=>{
 mock.requireUser.mockResolvedValue({access:{status:'active',permissions:['tools']}});const response=res();
 await generate({method:'POST',body:{preview:true,draftIds:['secret']}},response);
 expect(response.statusCode).toBe(403);expect(mock.read).not.toHaveBeenCalled();expect(mock.generate).not.toHaveBeenCalled();
});
it('stores only whitelisted feedback metadata with verified actor',async()=>{
 mock.requireUser.mockResolvedValue({id:'support'});const response=res();
 await knowledge({method:'POST',headers:{origin:'https://app.test',host:'app.test'},body:{action:'feedback',rating:'negative',reason:'Не тот язык',project:'p',language:'ru',customerMessage:'private',answer:'private',author:'forged'}},response);
 expect(response.statusCode).toBe(200);expect(mock.db.mock.calls[0][2]).toEqual({actor:'support',expected:0,operation:'feedback',value:{rating:'negative',reason:'Не тот язык',project:'p',language:'ru'}});
});
it('rejects stale edits and publishing without publish permission',async()=>{
 mock.requireUser.mockResolvedValue({id:'trainer',access:{status:'active',permissions:['ai.train']}});mock.read.mockResolvedValue({version:2,document:{entries:[]}});
 const request={method:'POST',headers:{origin:'https://app.test',host:'app.test'},body:{action:'save',expected:1}};const stale=res();await knowledge(request,stale);expect(stale.statusCode).toBe(409);
 const denied=res();await knowledge({...request,body:{action:'publish',expected:2}},denied);expect(denied.statusCode).toBe(403);expect(mock.db).not.toHaveBeenCalled();
});

