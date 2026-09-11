import {requireUser} from '../_auth.js';
import {config,db} from '../agent-monitor/_server.js';
import {validContent} from './validation.js';
export default async function handler(req,res) {
 res.setHeader('Cache-Control','private, no-store');res.setHeader('Content-Type','application/json; charset=utf-8');
 const send=(status,data)=>{res.statusCode=status;res.end(JSON.stringify(data));};
 try {
  if(!['GET','POST'].includes(req.method))return send(405,{error:'Method not allowed'});
  const body=req.method==='POST'?(typeof req.body==='string'?JSON.parse(req.body):req.body??{}):{};
  const kind=req.method==='GET'?new URL(req.url,'http://localhost').searchParams.get('dataset'):body.dataset;
  if(!['emails','bonuses','bonus-tools','binds'].includes(kind))return send(400,{error:'Неизвестный справочник'});
  if(req.method==='POST'&&(!req.headers.origin||new URL(req.headers.origin).host!==req.headers.host))return send(403,{error:'Invalid origin'});
  const scope=req.method==='GET'?new URL(req.url,'http://localhost').searchParams.get('scope'):body.scope;
  const personal=scope==='personal';
  if(personal&&!['bonuses','bonus-tools'].includes(kind))return send(400,{error:'Личные версии разрешены только для бонусов'});
  const permission=kind==='emails'?'projects':kind==='bonuses'||kind==='bonus-tools'?'bonuses':'knowledge';
  const actor=await requireUser(req,{permission:`${permission}.${req.method==='GET'||personal?'read':'write'}`});const env=config();
  if(req.method==='GET')return send(200,(await db(env,personal?`supportos_personal_content?owner_id=eq.${actor.id}&id=eq.${kind}&select=*`:`supportos_shared_content?id=eq.${kind}&select=*`))[0]??null);
  if(JSON.stringify(body).length>3000000||!validContent(kind,body.data)|| (kind!=='binds'&&(!Number.isInteger(body.expected)||body.expected<0)))return send(400,{error:'Некорректные данные или превышен размер импорта'});
  const response=await fetch(`${env.SUPABASE_URL.replace(/\/$/,'')}/rest/v1/rpc/${personal?'supportos_save_personal_content':kind==='binds'?'supportos_import_common_binds':'supportos_publish_content'}`,{
   method:'POST',headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,'Content-Type':'application/json'},
   body:JSON.stringify(personal?{actor:actor.id,dataset:kind,expected:body.expected,payload:body.data,operation:body.action??'save'}:kind==='binds'?{actor:actor.id,payload:body.data}:{actor:actor.id,dataset:kind,expected:body.expected,payload:body.data}),signal:AbortSignal.timeout(20000)
  });
  const result=await response.json();
  return send(response.ok?200:result.code==='42501'?403:result.code==='40001'?409:400,response.ok?result:{error:['42501','40001','22023'].includes(result.code)?result.message:'Не удалось опубликовать данные'});
 }catch(error){send(error.status??500,{error:error.status?error.message:'Не удалось загрузить общие данные'});}
}
