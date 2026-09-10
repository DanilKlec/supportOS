import {requireUser} from '../_auth.js';
import {config,db} from '../agent-monitor/_server.js';
import {readGuidance} from './_knowledge.js';
export default async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store');res.setHeader('Content-Type','application/json');
 const send=(status,body)=>{res.statusCode=status;res.end(JSON.stringify(body));};
 try{
  if(!['GET','POST'].includes(req.method))return send(405,{error:'Method not allowed'});
  if(req.method==='POST'&&(!req.headers.origin||new URL(req.headers.origin).host!==req.headers.host))return send(403,{error:'Invalid origin'});
  const actor=await requireUser(req,{permission:'ai.train'});
  if(req.method==='GET')return send(200,await readGuidance());
  const body=typeof req.body==='string'?JSON.parse(req.body):req.body??{};
  if(typeof body.content!=='string'||body.content.length>16000)return send(400,{error:'Правила должны быть текстом до 16 000 символов'});
  await db(config(),'supportos_ai_guidance?id=eq.main',{content:body.content,updated_at:new Date().toISOString(),updated_by:actor.id},'PATCH');
  return send(200,{ok:true});
 }catch(error){return send(error.status??500,{error:error.status?error.message:'Не удалось сохранить правила ИИ'});}
}
