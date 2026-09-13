import { requireUser } from '../_auth.js';
import { can } from '../../shared/access.js';
import { readGuidance } from './_knowledge.js';
import { buildAIContext } from './runtime.js';
import { sendJson } from './_gemini.js';
import { generateAIReply } from './_provider.js';
export default async function handler(request,response){
 response.setHeader('Cache-Control','private, no-store');
 if(request.method!=='POST')return sendJson(response,405,{error:'Method not allowed'});
 try{
  const body=typeof request.body==='string'?JSON.parse(request.body):request.body??{};
  const permission=body.purpose==='composer'?'composer.use':body.purpose==='playground'?'ai.playground':body.purpose==='test'?'ai.tests':'tools';
  const actor=await requireUser(request,{permission});
  if(body.preview&&!can(actor.access,'ai.playground'))return sendJson(response,403,{error:'Нет доступа к Draft Preview'});
  const guidance=await readGuidance();
  const context=buildAIContext({...guidance.document,global:guidance.document?.global??guidance.content},body,{draftIds:body.preview&&Array.isArray(body.draftIds)?body.draftIds.filter(id=>typeof id==='string').slice(0,150):[]});
  const result=await generateAIReply({...body,approvedGuidance:context.approvedGuidance,glossary:context.glossary});
  sendJson(response,200,{...result,...(can(actor.access,'ai.playground')||can(actor.access,'ai.tests')?{metadata:context.metadata}:{})});
 }catch(error){sendJson(response,error.status??500,{error:error.status?error.message:'Не удалось подготовить ответ'});}
}
