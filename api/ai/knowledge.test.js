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
 mock.requireUser.mockResolvedValue({id:'shift-id'});mock.db.mockResolvedValue(null);const response=res();
 await knowledge({method:'POST',headers:{origin:'https://app.test',host:'app.test'},body:{content:'Approved facts',updated_by:'forged'}},response);
 expect(mock.requireUser).toHaveBeenCalledWith(expect.anything(),{permission:'ai.train'});
 expect(mock.db.mock.calls[0][2]).toMatchObject({content:'Approved facts',updated_by:'shift-id'});expect(response.statusCode).toBe(200);
});
it('uses stored guidance instead of client-supplied guidance',async()=>{
 mock.authorize.mockResolvedValue(true);mock.read.mockResolvedValue({content:'Verified guidance'});mock.generate.mockResolvedValue({answer:'ok'});
 await generate({method:'POST',body:{customerMessage:'help',approvedGuidance:'forged'}},res());
 expect(mock.generate).toHaveBeenCalledWith({customerMessage:'help',approvedGuidance:'Verified guidance'});
});
