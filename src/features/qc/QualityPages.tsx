import { ProposalWorkflow } from "@/features/spaces/ProposalWorkflow";
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import type { Bind } from '@/entities/bind';
import { languages } from '@/entities/language';
import { useAIRuntime, useMaterials, useProposals, useSignals } from '@/features/operations/data';
import { Badge, Panel, QueryState, Row, Unavailable } from '@/features/operations/OperationsWorkspace';
import { BindDiff } from '@/features/shared-binds/BindDiff';
import { BindProposals } from '@/features/shared-binds/BindProposals';
import { sharedBindsService } from '@/services/shared-binds.service';
import { getDuplicateGroups } from '@/shared/lib/knowledge-health';
import { useViewState } from '@/shared/hooks/useViewState';
import { useBonusStore } from '@/store/bonus.store';
import { useAuthStore } from '@/store/auth.store';
import { can, canAccessPage, canTrain } from '../../../shared/access.js';
import { reviewItems } from './review-model';

export const kindLabels:Record<string,string>={proposal:'Предложение оператора',outdated:'Материал устарел',gap:'Пробел в знаниях'};
const title=(b:Bind)=>b.translations[0]?.title||b.slug;
const date=(value:string)=>new Date(value).toLocaleString('ru');
const missing=(b:Bind)=>languages.filter(l=>!b.translations.some(t=>t.language===l.code&&t.content.trim()));
function MaterialLink({id,children='Открыть материал'}:{id:string;children?:React.ReactNode}){return <Link to="/" hash={`bind=${encodeURIComponent(id)}`} className="ui-button ui-button--secondary">{children}</Link>;}
function MaterialText({bind}:{bind:Bind}){return <div className="qc-material-text">{bind.translations.map(t=><section key={t.language}><h4>{t.language.toUpperCase()} · {t.title}</h4><p>{t.content}</p></section>)}</div>;}

export function QCOverview({onSelect}:{onSelect:(hash:string)=>void}) {
 const proposals=useProposals(),signals=useSignals(),materials=useMaterials();
 const items=reviewItems(proposals.data??[],signals.data??{feedback:[],gaps:[]},materials.data??[]);
 const duplicates=getDuplicateGroups(materials.data??[]);
 const translations=(materials.data??[]).filter(b=>!b.archived&&missing(b).length);
 const cards=[
  {label:'Требуют проверки',value:items.length,ready:!!proposals.data&&!!signals.data,hash:'inbox'},
  {label:'Предложения операторов',value:items.filter(i=>i.kind==='proposal').length,ready:!!proposals.data,hash:'proposals'},
  {label:'Пробелы в знаниях',value:items.filter(i=>i.kind==='gap').length,ready:!!signals.data,hash:'gaps'},
  {label:'Устаревшие материалы',value:items.filter(i=>i.kind==='outdated').length,ready:!!signals.data,hash:'outdated'},
  {label:'Возможные дубли',value:duplicates.length,ready:!!materials.data,hash:'duplicates'},
  {label:'Нет нужных переводов',value:translations.length,ready:!!materials.data,hash:'languages'},
 ];
 return <div className="ops-stack"><QueryState query={proposals}/><QueryState query={signals}/><QueryState query={materials}/>
  <div className="qc-metrics">{cards.filter(c=>c.ready).map(c=><button key={c.hash} type="button" onClick={()=>onSelect(c.hash)}><span>{c.label}</span><strong>{c.value}</strong><small>{c.hash==='duplicates'?'Групп похожих материалов':c.hash==='languages'?'Материалов':'В доступной выборке'}</small></button>)}</div>
  <p className="ops-note">Очередь учитывает последние 100 отметок материалов и 100 сообщений о пробелах. Дубли и переводы проверяются по доступным общим материалам.</p>
  <Panel title="Требует внимания">
   {items.slice(0,8).map(i=><Row key={i.id} title={i.title} detail={`${kindLabels[i.kind]} · ${date(i.createdAt)}`}><button type="button" className="ui-button" onClick={()=>onSelect(`inbox?item=${encodeURIComponent(i.id)}`)}>Проверить</button></Row>)}
   {translations.slice(0,3).map(b=><Row key={b.id} title={title(b)} detail={`Нет перевода: ${missing(b).map(l=>l.code.toUpperCase()).join(', ')}`}><MaterialLink id={b.id}/></Row>)}
   {duplicates.slice(0,3).map(group=><Row key={group[0].id} title={group.map(title).join(' · ')} detail="Найден возможный дубль"><button type="button" className="ui-button" onClick={()=>onSelect('duplicates')}>Сравнить</button></Row>)}
   {!!proposals.data&&!!signals.data&&!!materials.data&&!items.length&&!translations.length&&!duplicates.length&&<Unavailable message="Сейчас нет материалов, требующих проверки."/>}
  </Panel>
 </div>;
}
export function ReviewInbox({initialFilter='all',initialItem=''}:{initialFilter?:string;initialItem?:string}) {
 const proposals=useProposals(),signals=useSignals(),materials=useMaterials();
 const [savedFilter,setFilter]=useViewState('qc-queue','filter','all');
 const [filterOverride,setFilterOverride]=useState(initialFilter==='all'?'':initialFilter);
 const filter=filterOverride||savedFilter;
 const [search,setSearch]=useViewState('qc-queue','search','');
 const [project,setProject]=useViewState('qc-queue','project','');
 const [selected,setSelected]=useState(initialItem);
 const projects=useBonusStore(s=>s.projects);
 const items=reviewItems(proposals.data??[],signals.data??{feedback:[],gaps:[]},materials.data??[]);
 const projectName=(id?:string)=>projects.find(p=>p.id===id)?.name||id||'';
 const visible=items.filter(i=>(filter==='all'||i.kind===filter)&&(!project||i.projectId===project)&&[i.title,projectName(i.projectId),...i.evidence, i.searchText].join(' ').toLowerCase().includes(search.toLowerCase()));
 const current=items.find(i=>i.id===selected)??visible[0];
 const material=materials.data?.find(b=>b.id===current?.materialId);
 const setKind=(kind:string)=>{setFilterOverride(kind);setFilter(kind);setSelected('');};
 return <div className="ops-stack"><QueryState query={signals}/><QueryState query={proposals}/><QueryState query={materials}/>
  <div className="ops-toolbar"><input className="ui-input" aria-label="Поиск очереди" placeholder="Название, проект или текст…" value={search} onChange={e=>{setSearch(e.target.value);setSelected('');}}/>
   {items.some(i=>i.projectId)&&<label className="ui-field">Проект<select className="ui-input" value={project} onChange={e=>{setProject(e.target.value);setSelected('');}}><option value="">Все проекты</option>{[...new Set(items.map(i=>i.projectId).filter(Boolean))].map(id=><option key={id} value={id}>{projectName(id)}</option>)}</select></label>}
  </div>
  <div className="ui-actions" aria-label="Тип проверки">{[['all','Все'],['proposal','Предложения'],['outdated','Устаревшие'],['gap','Пробелы']].map(([id,label])=><button type="button" key={id} className="space-tab" aria-pressed={filter===id} onClick={()=>setKind(id)}>{label}</button>)}</div>
  {(visible.length>0||selected&&current)?<div className={`qc-queue ${selected?'qc-queue--selected':''}`}>
   <div className="ops-review-list qc-queue-list">{visible.map(i=><button type="button" key={i.id} className="ops-review-item" aria-pressed={i.id===current?.id} onClick={()=>setSelected(i.id)}><strong>{i.title}</strong>{i.projectId&&<span>{projectName(i.projectId)}</span>}<span>{kindLabels[i.kind]} · {date(i.createdAt)}</span><span>Источник: оператор</span></button>)}</div>
   {current&&<div className="qc-queue-detail"><button className="ui-button qc-queue-back" type="button" onClick={()=>setSelected('')}>Назад к очереди</button><Panel title={current.title} aside={<Badge>{kindLabels[current.kind]}</Badge>}>
    <div className="ops-note"><p>Источник: оператор · {date(current.createdAt)}</p>{current.projectId&&<p>Проект: {projectName(current.projectId)}</p>}{current.evidence.map(e=><p key={e}>{e}</p>)}</div>
    {current.kind==='proposal'?<BindProposals key={current.id} sourceId={current.materialId} proposalId={current.id.slice('proposal:'.length)} expanded/>:<>
     {material&&<><h4 className="ops-note">Текущая версия · обновлена {date(material.updatedAt)}</h4><MaterialText bind={material}/></>}
     <p className="ops-note">{current.kind==='gap'?'Подготовьте проверенный ответ на эту тему в материалах команды.':'Сверьте текст с действующими правилами проекта и внесите необходимые изменения.'}</p>
     <div className="ops-panel-actions">{current.materialId&&<MaterialLink id={current.materialId}>Открыть и обновить</MaterialLink>}<Link to="/qc" hash="materials" className="ui-button">Открыть материалы</Link></div>
    </>}
    {current.kind==='proposal'&&current.materialId&&<div className="ops-panel-actions"><MaterialLink id={current.materialId}/></div>}
   </Panel></div>}
  </div>:!signals.isPending&&!proposals.isPending&&!signals.error&&!proposals.error&&<Unavailable message={search||project?'По выбранным фильтрам ничего не найдено.':filter==='proposal'?'Предложений операторов пока нет.':filter==='gap'?'Пробелы в знаниях не обнаружены.':'Сейчас нет материалов, требующих проверки.'}/>}
 </div>;
}
export function DuplicateKnowledge() {
 const materials=useMaterials();
 const groups=getDuplicateGroups(materials.data??[]);
 const [selected,setSelected]=useState('');
 return <Panel title="Возможные дубли"><QueryState query={materials}/><p className="ops-note">У этих материалов совпадает нормализованный текст. Сравните их перед редактированием: совпадение не всегда означает лишнюю запись.</p>
 {groups.map(group=><section key={group[0].id} className="qc-duplicate"><Row title={group.map(title).join(' · ')} detail={`${group.length} материалов`}><button className="ui-button" type="button" onClick={()=>setSelected(selected===group[0].id?'':group[0].id)}>{selected===group[0].id?'Свернуть':'Сравнить'}</button></Row>{selected===group[0].id&&<div className="qc-comparison">{group.map(b=><article key={b.id}><h4>{title(b)}</h4><MaterialText bind={b}/><MaterialLink id={b.id}/></article>)}</div>}</section>)}
 {materials.data&&!groups.length&&<Unavailable message="Возможные дубли не найдены."/>}</Panel>;
}
export function LanguageQuality() {
 const materials=useMaterials();
 const [language,setLanguage]=useViewState('qc-translations','language','');
 const [onlyMissing,setOnlyMissing]=useViewState('qc-translations','missing',true);
 const [search,setSearch]=useViewState('qc-translations','search','');
 const rows=(materials.data??[]).filter(b=>!b.archived&&title(b).toLowerCase().includes(search.toLowerCase())&&(!onlyMissing||missing(b).some(l=>!language||l.code===language)));
 return <Panel title="Переводы"><QueryState query={materials}/><p className="ops-note">Показываем наличие текста на каждом языке. Это не оценка точности перевода.</p><div className="ops-toolbar"><input className="ui-input" placeholder="Поиск материала…" aria-label="Поиск переводов" value={search} onChange={e=>setSearch(e.target.value)}/><select className="ui-input" aria-label="Язык перевода" value={language} onChange={e=>setLanguage(e.target.value)}><option value="">Все языки</option>{languages.map(l=><option key={l.code} value={l.code}>{l.code.toUpperCase()}</option>)}</select><label><input type="checkbox" checked={onlyMissing} onChange={e=>setOnlyMissing(e.target.checked)}/> Только отсутствующие</label></div>
 {materials.data&&<p className="ops-note">Найдено материалов: {rows.length}</p>}{rows.map(b=><Row key={b.id} title={title(b)}><div className="ui-actions">{languages.filter(l=>!language||l.code===language).map(l=><Badge key={l.code}>{l.code.toUpperCase()} · {missing(b).some(m=>m.code===l.code)?'Нет перевода':'Есть перевод'}</Badge>)}<MaterialLink id={b.id}/></div></Row>)}{materials.data&&!rows.length&&<Unavailable message={onlyMissing?'Для выбранного языка все доступные материалы переведены либо не соответствуют поиску.':'Материалы не найдены.'}/>}</Panel>;
}
export function AIQuality() {
 const runtime=useAIRuntime();const access=useAuthStore(s=>s.session?.user.access);
 return <Panel title="Оценки операторов"><p className="ops-note">Оценки операторов в доступной выборке. Они помогают найти проблемы, но не измеряют общее качество AI.</p>{canTrain(access)?<><QueryState query={runtime}/>{runtime.data&&<div className="qc-metrics">{[['Оценок получено',runtime.data.document.feedback.length],['Положительных',runtime.data.document.feedback.filter(f=>f.rating==='positive').length],['Отрицательных',runtime.data.document.feedback.filter(f=>f.rating==='negative').length]].map(([label,value])=><div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>}</>:<Unavailable message="У вашей роли нет доступа к оценкам операторов. Доступные проверки находятся во вкладках выше."/>}<div className="ops-panel-actions">{[['playground','Проверить ответ'],['tests','Открыть тесты'],['feedback','Отзывы операторов']].filter(([id])=>canAccessPage(access,'/qc',id)).map(([id,label])=><Link key={id} to="/qc" hash={id} className="ui-button">{label}</Link>)}</div></Panel>;
}
export function KnowledgeHistory() {
 const materials=useMaterials(); const [id,setId]=useViewState('qc-history','material','');const user=useAuthStore(s=>s.session?.user);
 const selected=materials.data?.find(b=>b.id===id);
 const history=useQuery({queryKey:['bind-history',user?.id,id],queryFn:()=>sharedBindsService.history(id),enabled:!!id&&can(user?.access,'knowledge.write')});
 return <div className="ops-stack"><h3>История изменений</h3><details className="ops-panel"><summary className="ops-note">Результаты и история предложений</summary><div className="ops-note"><ProposalWorkflow/></div></details><QueryState query={materials}/><label className="ui-field">Материал<select className="ui-input" value={id} onChange={e=>setId(e.target.value)}><option value="">Выберите материал</option>{materials.data?.map(b=><option key={b.id} value={b.id}>{title(b)}</option>)}</select></label>
 {!id?<Unavailable message="Выберите материал, чтобы увидеть последние 50 сохранённых версий."/>:<><QueryState query={history}/>{history.data?.length===0&&<Unavailable message="История материала пуста."/>}{history.data?.map(r=><details key={r.id} className="ops-panel"><summary className="ops-note">Версия от {date(r.created_at)} · {r.owner_id?'Личная версия':'Общий материал'} · {{INSERT:'Создано',UPDATE:'Изменено',DELETE:'Удалено',insert:'Создано',update:'Изменено',delete:'Удалено'}[r.operation]||'Сохранена версия'}</summary><MaterialText bind={r.snapshot}/>{selected&&<div className="ops-note"><h4>Сравнение сохранённой и текущей версии</h4><BindDiff before={r.snapshot} after={selected}/></div>}</details>)}{selected&&<MaterialLink id={id}>Открыть текущий материал</MaterialLink>}</>}
 </div>;
}
