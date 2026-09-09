import {requireUser} from '../_auth.js';
import {validateSchedule} from './_schedule.js';
import {allRows,collect,config,db,equal,normalizeStatus} from './_server.js';

export default async function handler(req,res) {
 res.setHeader('Cache-Control','no-store');
 res.setHeader('Content-Type','application/json; charset=utf-8');
 const send=(status,body)=>{res.statusCode=status;res.end(JSON.stringify(body));};
 try {
  let env;
  const url=new URL(req.url,'http://localhost');
  const action=url.searchParams.get('action') ?? 'data';
  const body=typeof req.body==='string' ? JSON.parse(req.body) : req.body ?? {};
  const method=req.method;
  if(action==='webhook') {
   env=config(process.env, ['LIVECHAT_WEBHOOK_SECRET','LIVECHAT_ORGANIZATION_ID']);
   if(method!=='POST') return send(405,{error:'POST required'});
   if(!equal(body.secret_key,env.LIVECHAT_WEBHOOK_SECRET)||body.organization_id!==env.LIVECHAT_ORGANIZATION_ID) return send(401,{error:'Invalid webhook'});
   if(body.action!=='routing_status_set') return send(200,{ignored:true});
   const id=body.payload?.agent_id;
   const status=normalizeStatus(body.payload?.status);
   if(typeof id!=='string'||!id||id.length>320||status==='unknown') return send(400,{error:'Invalid status payload'});
   // LiveChat's documented webhook has no event timestamp or unique delivery ID.
   // Store receipt time, and do not invent the actor or exact time of the switch.
   await db(env,'rpc/monitor_ingest',{rows:[{id,status}],observed:new Date().toISOString(),origin:'webhook'});
   return send(200,{ok:true});
  }
  if(action==='collect') {
   env=config(process.env, ['MONITOR_COLLECTOR_SECRET']);
   if(method!=='POST') return send(405,{error:'POST required'});
   if(!equal(req.headers.authorization,`Bearer ${env.MONITOR_COLLECTOR_SECRET}`)) return send(401,{error:'Unauthorized'});
   return send(200,await collect(env));
  }
  if(method!=='GET') {
   const origin=req.headers.origin;
   if(!origin||new URL(origin).host!==req.headers.host) return send(403,{error:'Invalid origin'});
  }
  const user=await requireUser(req,{supervisor:true});
  env=config();
  if(action==='sync' && method==='POST') return send(200,await collect(env));
  if(action==='schedule-import' && method==='POST') {
   const payload=validateSchedule(body);
   const agents=await allRows(env,'monitor_agents?select=id&order=id');
   const known=new Map(agents.map(agent=>[agent.id.toLowerCase(),agent.id]));
   if(payload.people.some(email=>!known.has(email))) return send(400,{error:'Некоторые почты не найдены в LiveChat. Обновите предпросмотр графика.'});
   const result=await db(env,'rpc/monitor_import_schedule',{work_month:`${payload.month}-01`,people:payload.people.map(email=>known.get(email)),records:payload.records.map(row=>({day:row.day,agent_id:known.get(row.email),shift:row.shift})),username:user.id});
   return send(200,{ok:true,...result});
  }
  const day=url.searchParams.get('day');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day ?? '')||Number.isNaN(Date.parse(day))||new Date(day).toISOString().slice(0,10)!==day) return send(400,{error:'Некорректная дата'});
  if(action==='assignment' && method==='POST') {
   if(typeof body.agentId!=='string'||!['day','evening','night'].includes(body.shift)||typeof body.enabled!=='boolean') return send(400,{error:'Некорректное назначение'});
   await db(env,'rpc/monitor_assign',{work_day:day,agent:body.agentId,shift_id:body.shift,enabled:body.enabled,username:user.id});
   return send(200,{ok:true});
  }
  if(!['data','history'].includes(action)||method!=='GET') return send(405,{error:'Unknown action or method'});
  const start=Date.parse(`${day}T09:00:00+03:00`);
  const stop=Math.min(start+24*3600000,Date.now());
  const from=new Date(start-90000).toISOString();
  const to=new Date(Math.max(start,stop)).toISOString();
  if(action==='history') {
   const before=url.searchParams.get('before');
   if(!/^\d{1,16}$/.test(before ?? '')) return send(400,{error:'Invalid cursor'});
   const observations=await db(env,`monitor_observations?select=*&changed=eq.true&at=gte.${from}&at=lte.${to}&id=lt.${before}&order=id.desc&limit=500`);
   return send(200,{observations,hasMore:observations.length===500});
  }
  const currentDay=new Date(Date.now()-6*3600000).toISOString().slice(0,10);
  const [agents,observations,assignments,audit,health,totals]=await Promise.all([
   allRows(env,'monitor_agents?select=*&order=id'),
   db(env,`monitor_observations?select=*&changed=eq.true&at=gte.${from}&at=lte.${to}&order=id.desc&limit=1000`),
   allRows(env,`monitor_assignments?select=*&day=eq.${day}&order=agent_id,shift`),
   allRows(env,`monitor_assignment_audit?select=*&day=eq.${day}&order=at.desc,id.desc`),
   db(env,'monitor_control?select=id,updated_at&id=in.(collect,webhook)'),
   db(env,'rpc/monitor_report',{work_day:day,cutoff:new Date().toISOString()})
  ]);
  const currentAssignments=currentDay===day ? assignments : await allRows(env,`monitor_assignments?select=*&day=eq.${currentDay}&order=agent_id,shift`);
  return send(200,{agents,observations,assignments,currentAssignments,audit,totals,historyLimited:observations.length>=1000,lastSync:health.find(row=>row.id==='collect')?.updated_at ?? null,lastWebhook:health.find(row=>row.id==='webhook')?.updated_at ?? null,serverTime:Date.now()});
 } catch(error) {return send(error.status ?? 500,{error:error.status?error.message:'Ошибка мониторинга. Проверьте настройки сервера и соединение.'});}
}


