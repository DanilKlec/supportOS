import {normalizeProjectEmail} from "../../shared/project-emails.js";
import {requireUser} from '../_auth.js';
import {config,db} from '../agent-monitor/_server.js';
import {validContent} from './validation.js';

const NORMALIZED_DATASETS=new Set(['emails','bonuses','bonus-tools']);

async function rows(env,path) {
 const result=[];
 for(let offset=0;;offset+=1000) {
  const separator=path.includes('?')?'&':'?';
  const page=await db(env,`${path}${separator}limit=1000&offset=${offset}`);
  if(!Array.isArray(page))return result;
  result.push(...page);
  if(page.length<1000)return result;
  if(result.length>=200000)throw Object.assign(new Error('Слишком большой справочник.'),{status:413});
 }
}

const optional=(key,value)=>value===null||value===undefined?{}:{[key]:value};
const numberOrUndefined=value=>value===null||value===undefined||value===''?undefined:Number(value);
const latest=(values)=>values.filter(Boolean).sort().at(-1)??new Date(0).toISOString();
const searchText=(rule)=>[
 rule.group,rule.site,rule.welcomeWager,rule.welcomeMaxWin,rule.noDeposit,
 rule.retentionWager,rule.retentionMaxWin,rule.events,rule.map,rule.note,
].join(' ').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\u0451/g,'\u0435').replace(/[^a-z0-9\u0430-\u044f\u0370-\u03ff]+/g,' ').trim();

function publication(kind,data,revision,timestamps=[]) {
 return {id:kind,data,version:revision?.version??1,updated_at:revision?.updated_at??latest(timestamps),updated_by:revision?.updated_by??null};
}

async function readEmails(env,revision) {
 const emailRows=await rows(env,'supportos_project_emails?select=id,project_id,type,email,note,sort_order,updated_at&order=project_id.asc,sort_order.asc,id.asc');
 if(!revision&&!emailRows.length)return null;
 const projects=await rows(env,'supportos_projects?select=id,name,slug,source_hash,updated_at&order=name.asc,id.asc');
 const byProject=new Map();
 for(const email of emailRows) {
  const list=byProject.get(email.project_id)??[];
  list.push({id:email.id,type:email.type,email:email.email,...optional('note',email.note)});
  byProject.set(email.project_id,list);
 }
 const data=projects.filter(project=>byProject.has(project.id)).map(project=>normalizeProjectEmail({
  id:project.id,projectName:project.name,slug:project.slug,emails:byProject.get(project.id),
  sourceHash:project.source_hash??undefined,updatedAt:project.updated_at,
 }));
 return publication('emails',data,revision,[...projects.map(row=>row.updated_at),...emailRows.map(row=>row.updated_at)]);
}

async function readBonuses(env,revision) {
 const bonusRows=await rows(env,'supportos_welcome_bonuses?select=*&order=project_id.asc,sort_order.asc,id.asc');
 if(!revision&&!bonusRows.length)return null;
 const [projects,translations]=await Promise.all([
  rows(env,'supportos_projects?select=id,name,slug,sheet_id,source_url,source_hash,updated_at&order=name.asc,id.asc'),
  rows(env,'supportos_welcome_bonus_translations?select=*&order=welcome_bonus_id.asc,language.asc'),
 ]);
 const translationsByBonus=new Map();
 for(const translation of translations) {
  const list=translationsByBonus.get(translation.welcome_bonus_id)??[];
  list.push({language:translation.language,content:translation.content,updatedAt:translation.updated_at});
  translationsByBonus.set(translation.welcome_bonus_id,list);
 }
 const bonusesByProject=new Map();
 for(const bonus of bonusRows) {
  const bonusTranslations=translationsByBonus.get(bonus.id)??[];
  const content=bonusTranslations.find(item=>item.language==='ru')?.content??bonusTranslations.find(item=>item.language==='en')?.content??bonusTranslations[0]?.content??'';
  const list=bonusesByProject.get(bonus.project_id)??[];
  list.push({
   id:bonus.id,name:bonus.name,
   ...optional('minDepositAmount',numberOrUndefined(bonus.min_deposit_amount)),
   ...optional('minDepositCurrency',bonus.min_deposit_currency),
   content,translations:bonusTranslations,order:bonus.sort_order,
   ...optional('validUntil',bonus.valid_until),...optional('reviewDue',bonus.review_due),
   ...optional('checkedAt',bonus.checked_at),...optional('responsible',bonus.responsible),
  });
  bonusesByProject.set(bonus.project_id,list);
 }
 const data=projects.filter(project=>bonusesByProject.has(project.id)).map(project=>({
  id:project.id,name:project.name,slug:project.slug,...optional('sheetId',project.sheet_id),
  ...optional('sourceUrl',project.source_url),...optional('sourceHash',project.source_hash),
  bonuses:bonusesByProject.get(project.id),updatedAt:project.updated_at,
 }));
 return publication('bonuses',data,revision,[...projects.map(row=>row.updated_at),...bonusRows.map(row=>row.updated_at),...translations.map(row=>row.updated_at)]);
}

async function readBonusTools(env,revision) {
 const [ruleRows,tableRows]=await Promise.all([
  rows(env,'supportos_bonus_rules?select=*&order=sort_order.asc,id.asc'),
  rows(env,'supportos_currency_tables?select=*&order=sort_order.asc,id.asc'),
 ]);
 if(!revision&&!ruleRows.length&&!tableRows.length)return null;
 const [projects,currencyRows,currencyValues]=await Promise.all([
  rows(env,'supportos_projects?select=id,name,source_url,updated_at&order=id.asc'),
  rows(env,'supportos_currency_rows?select=*&order=currency_table_id.asc,sort_order.asc,id.asc'),
  rows(env,'supportos_currency_values?select=*&order=currency_row_id.asc,currency_code.asc'),
 ]);
 const projectsById=new Map(projects.map(project=>[project.id,project]));
 const rules=ruleRows.map(row=>{
  const rule={id:row.id,group:row.group_name,site:projectsById.get(row.project_id)?.name??'',welcomeWager:row.welcome_wager,welcomeMaxWin:row.welcome_max_win,noDeposit:row.no_deposit,retentionWager:row.retention_wager,retentionMaxWin:row.retention_max_win,events:row.events,map:row.map,note:row.note};
  return {...rule,searchText:searchText(rule)};
 });
 const valuesByRow=new Map();
 for(const value of currencyValues) {
  const values=valuesByRow.get(value.currency_row_id)??{};
  values[value.currency_code]=value.value_text;
  valuesByRow.set(value.currency_row_id,values);
 }
 const rowsByTable=new Map();
 for(const row of currencyRows) {
  const list=rowsByTable.get(row.currency_table_id)??[];
  list.push({base:row.base,...optional('baseAmount',numberOrUndefined(row.base_amount)),values:valuesByRow.get(row.id)??{}});
  rowsByTable.set(row.currency_table_id,list);
 }
 const currencyTables=tableRows.map(table=>{
  const tableData=rowsByTable.get(table.id)??[];
  return {name:table.name,currencies:[...new Set(tableData.flatMap(row=>Object.keys(row.values)))].sort(),rows:tableData};
 });
 const sourceUrl=revision?.metadata?.sourceUrl??ruleRows.map(row=>projectsById.get(row.project_id)?.source_url).find(Boolean)??'';
 const updatedAt=revision?.metadata?.loadedAt??revision?.updated_at??latest([...ruleRows.map(row=>row.updated_at),...tableRows.map(row=>row.updated_at),...currencyRows.map(row=>row.updated_at),...currencyValues.map(row=>row.updated_at)]);
 const warnings=Array.isArray(revision?.metadata?.warnings)?revision.metadata.warnings.filter(value=>typeof value==='string'):[];
 return publication('bonus-tools',[{id:'rules',slug:'rules',sourceUrl,rules,currencyTables,loadedAt:updatedAt,warnings}],revision,[updatedAt]);
}

async function readShared(env,kind) {
 const revisions=await rows(env,`supportos_content_revisions?id=eq.${kind}&select=*`);
 const revision=revisions[0];
 const normalized=kind==='emails'?await readEmails(env,revision):kind==='bonuses'?await readBonuses(env,revision):await readBonusTools(env,revision);
 if(normalized)return normalized;
 return (await db(env,`supportos_shared_content?id=eq.${kind}&select=*`))[0]??null;
}

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
  if(req.method==='GET')return send(200,personal?(await db(env,`supportos_personal_content?owner_id=eq.${actor.id}&id=eq.${kind}&select=*`))[0]??null:NORMALIZED_DATASETS.has(kind)?await readShared(env,kind):(await db(env,`supportos_shared_content?id=eq.${kind}&select=*`))[0]??null);
  if(JSON.stringify(body).length>3000000||!validContent(kind,body.data)|| (kind!=='binds'&&(!Number.isInteger(body.expected)||body.expected<0)))return send(400,{error:'Некорректные данные или превышен размер импорта'});
  const payload=kind==='emails'?body.data.map(normalizeProjectEmail):body.data;
  const rpc=personal?'supportos_save_personal_content':kind==='binds'?'supportos_import_common_binds':'supportos_publish_normalized_content';
  const response=await fetch(`${env.SUPABASE_URL.replace(/\/$/,'')}/rest/v1/rpc/${rpc}`,{
   method:'POST',headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,'Content-Type':'application/json'},
   body:JSON.stringify(personal?{actor:actor.id,dataset:kind,expected:body.expected,payload,operation:body.action??'save'}:kind==='binds'?{actor:actor.id,payload}:{actor:actor.id,dataset:kind,expected:body.expected,payload}),signal:AbortSignal.timeout(20000)
  });
  const result=await response.json();
  return send(response.ok?200:result.code==='42501'?403:result.code==='40001'?409:400,response.ok?result:{error:['42501','40001','22023'].includes(result.code)?result.message:'Не удалось опубликовать данные'});
 }catch(error){send(error.status??500,{code:error.code,error:error.status?error.message:'Не удалось загрузить общие данные'});}
}
