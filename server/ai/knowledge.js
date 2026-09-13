import {requireUser} from '../_auth.js';
import {can,canTrain} from '../../shared/access.js';
import {config,db} from '../agent-monitor/_server.js';
import {readGuidance} from './_knowledge.js';
import {editRuntime} from './runtime.js';
export default async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store');res.setHeader('Content-Type','application/json');const send=(status,body)=>{res.statusCode=status;res.end(JSON.stringify(body));};
 try{
  if(!['GET','POST'].includes(req.method))return send(405,{error:'Method not allowed'});
  if(req.method==='POST'&&(!req.headers.origin||new URL(req.headers.origin).host!==req.headers.host))return send(403,{error:'Invalid origin'});
  const body=typeof req.body==='string'?JSON.parse(req.body):req.body??{};
  const action=body.action??'instructions';
  const actor=await requireUser(req,{permission:req.method==='POST'&&action==='feedback'?'composer.use':null});
  if(action!=='feedback'&&!canTrain(actor.access))return send(403,{error:'Нет доступа к AI Training'});
  if(req.method==='GET'&&!canTrain(actor.access))return send(403,{error:'Нет доступа к AI Training'});
  if(req.method==='GET')return send(200,await readGuidance());
  if(action==='feedback'){
   const reasons=['Неверная информация','Не тот язык','Слишком длинно','Не учтена policy','Не найден материал','Другое'];
   if(!['positive','negative'].includes(body.rating)||body.rating==='negative'&&!reasons.includes(body.reason))return send(400,{error:'Выберите причину'});
   const value={rating:body.rating,reason:body.rating==='negative'?body.reason:'',project:typeof body.project==='string'?body.project.slice(0,100):'',language:typeof body.language==='string'?body.language.slice(0,10):''};
   await db(config(),'rpc/supportos_save_ai_runtime',{actor:actor.id,expected:0,operation:'feedback',value});return send(200,{ok:true});
  }
  if(['publish','archive','instructions'].includes(action)&&!can(actor.access,'ai.publish'))return send(403,{error:'Нет права публикации'});
  if(!['save','delete','publish','archive','instructions'].includes(action))return send(400,{error:'Неизвестное действие'});
  const current=await readGuidance();if(body.expected!==current.version)return send(409,{error:'Документ изменён. Обновите перед сохранением'});
  if(!['publish','archive'].includes(action)){
   const required=kind=>kind==='rules'?'ai.rules':kind==='tests'?'ai.tests':'ai.train';
   const old=current.document?.entries?.find(entry=>entry.id===body.id);
   if(!can(actor.access,required(body.entry?.kind??old?.kind))||(old&&!can(actor.access,required(old.kind))))return send(403,{error:'Нет права редактирования этого раздела'});
  }
  let document={...current.document,global:current.document?.global??current.content??''};
  if(action==='instructions'){if(typeof body.content!=='string'||body.content.length>16000)return send(400,{error:'Лимит инструкций — 16 000 символов'});document.global=body.content;}
  else {try{document=editRuntime(document,{...body,action},actor.id);}catch(error){return send(400,{error:error.message});}}
  const changed=body.id||document.entries?.at(-1)?.id||'main';
  const kind=document.entries?.find(entry=>entry.id===changed)?.kind??current.document?.entries?.find(entry=>entry.id===changed)?.kind??'instructions';
  await db(config(),'rpc/supportos_save_ai_runtime',{actor:actor.id,expected:body.expected,operation:action,value:{...document,_change:{id:action==='instructions'?'main':changed,kind}}});return send(200,{ok:true});
 }catch(error){return send(error.status??500,{error:error.status?error.message:'Не удалось сохранить AI. Обновите данные и повторите.'});}
}
