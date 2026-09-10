import {config,db} from './agent-monitor/_server.js';
export async function loadAccess(id,env=process.env){
 const access=await db(config(env),'rpc/supportos_rbac_context',{subject:id});
 return access??{status:'pending',roles:[],permissions:[],version:0,display_name:''};
}
export async function changeAccess(actor,operation,payload){
 const env=config();
 const response=await fetch(`${env.SUPABASE_URL.replace(/\/$/,'')}/rest/v1/rpc/supportos_rbac_change`,{
  method:'POST',headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,'Content-Type':'application/json'},
  body:JSON.stringify({actor,operation,payload}),signal:AbortSignal.timeout(15000)
 });
 const result=await response.json();
 if(!response.ok)throw Object.assign(new Error(result.message??'Ошибка изменения доступа'),{status:result.code==='42501'?403:result.code==='40001'?409:400});
 return result;
}
