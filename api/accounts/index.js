import {createClient} from '@supabase/supabase-js';
import {requireUser} from '../_auth.js';
import {can} from '../../shared/access.js';
import {changeAccess} from '../_rbac.js';
import {config,db,allRows} from '../agent-monitor/_server.js';
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
export function adminClient(env=process.env) {
 const resolved=config(env);
 return createClient(resolved.SUPABASE_URL,resolved.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}}).auth.admin;
}
async function catalog(env){
 const [roles,permissions,links]=await Promise.all([allRows(env,'supportos_roles?select=*&order=name'),allRows(env,'supportos_permissions?select=*&order=id'),allRows(env,'supportos_role_permissions?select=*&order=role_id,permission_id')]);
 return {roles:roles.map(role=>({...role,permissions:links.filter(link=>link.role_id===role.id).map(link=>link.permission_id)})),permissions};
}
export default async function handler(req,res) {
 res.setHeader('Cache-Control','private, no-store');res.setHeader('Content-Type','application/json; charset=utf-8');
 const send=(status,data)=>{res.statusCode=status;res.end(JSON.stringify(data));};
 try {
  if(!['GET','POST'].includes(req.method)) return send(405,{error:'Method not allowed'});
  if(req.method==='POST'&&(!req.headers.origin||new URL(req.headers.origin).host!==req.headers.host)) throw fail('Invalid origin',403);
  const url=new URL(req.url,'http://localhost');const action=url.searchParams.get('action')??'users';
  const actor=await requireUser(req,{permission:null});
  if(req.method==='GET'&&action==='me')return send(200,{id:actor.id,access:actor.access});
  const env=config();
  if(req.method==='GET') {
   if(!can(actor.access,'users.manage')&&!can(actor.access,'roles.manage'))throw fail('Недостаточно прав',403);
   if(action==='catalog')return send(200,await catalog(env));
   if(action==='audit'){
    const before=url.searchParams.get('before');if(before&&!/^\d{1,18}$/.test(before))throw fail('Некорректный курсор');
    const rows=await db(env,`supportos_access_audit?select=*&order=id.desc&limit=50${can(actor.access,'binds.manage')?'':'&action=not.like.bind.*'}${before?`&id=lt.${before}`:''}`);
    return send(200,{rows,hasMore:rows.length===50});
   }
   if(action!=='users'||!can(actor.access,'users.manage'))throw fail('Недостаточно прав',403);
   const page=Number(url.searchParams.get('page')??1);if(!Number.isInteger(page)||page<1||page>10000)throw fail('Некорректная страница');
   return send(200,await db(env,'rpc/supportos_rbac_list_users',{search_text:(url.searchParams.get('search')??'').slice(0,120),page_number:page}));
  }
  const body=typeof req.body==='string'?JSON.parse(req.body):req.body??{};
  if(body.action==='create'){
   if(!can(actor.access,'users.manage'))throw fail('Нет права создавать пользователей',403);
   if(typeof body.email!=='string'||body.email.length>320||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())||typeof body.password!=='string'||body.password.length<12||body.password.length>128)throw fail('Укажите почту и пароль длиной от 12 до 128 символов');
   if(!Array.isArray(body.roles)||!body.roles.length||body.roles.length>30||body.roles.some(r=>typeof r!=='string'))throw fail('Выберите роли');
   const data=await catalog(env);const owner=actor.access.roles.some(r=>r.id==='creator');
   if(body.roles.some(id=>{const role=data.roles.find(r=>r.id===id);return !role||(!owner&&(id==='creator'||role.permissions.some(p=>!actor.access.permissions.includes(p))));}))throw fail('Нельзя назначить эти роли',403);
   const result=await adminClient().createUser({email:body.email.trim(),password:body.password,email_confirm:true});
   if(result.error)throw fail('Не удалось создать аккаунт. Проверьте почту и требования к паролю');
   const id=result.data.user.id;
   try{await changeAccess(actor.id,'user.update',{id,roles:body.roles,status:'active',display_name:typeof body.display_name==='string'?body.display_name.slice(0,120):'',version:1});}
   catch{ return send(201,{id,warning:'Аккаунт создан без доступа. Найдите его в списке и назначьте роли.'});}
   return send(201,{id});
  }
  if(!['user.update','role.save','role.delete'].includes(body.action))throw fail('Неизвестное действие');
  return send(200,await changeAccess(actor.id,body.action,body.payload));
 }catch(error){return send(error.status??500,{error:error.status?error.message:'Ошибка управления доступами'});}
}
