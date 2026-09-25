import { useNavigate, useRouterState } from '@tanstack/react-router';
import { useEffect } from 'react';
import { AIControlCenter, type AISection } from '@/features/admin/AIControlCenter';
import { DepositBonusesPage } from '@/features/bonuses/DepositBonusesPage';
import { ProjectEmailsPage } from '@/features/project-emails/ProjectEmailsPage';
import { OperationsWorkspace } from '@/features/operations/OperationsWorkspace';
import { qcHashRedirects, qcSections } from '@/features/operations/sections';
import { SharedBindsPage } from '@/features/shared-binds/SharedBindsPage';
import { useAuthStore } from '@/store/auth.store';
import { canAccessPage } from '../../../shared/access.js';
import { AIQuality, DuplicateKnowledge, KnowledgeHistory, LanguageQuality, ReviewInbox, QCOverview } from './QualityPages';
import { materialTabs, problemTabs, qualityTabs, qcDestination } from './navigation';

const aiSections: Record<string, AISection> = {knowledge:'knowledge',rules:'rules',instructions:'projects',glossary:'glossary',playground:'playground',tests:'tests',feedback:'feedback'};
export function QCWorkspace() {
 const access=useAuthStore(s=>s.session?.user.access);
 const hash=useRouterState({select:s=>s.location.hash});
 const navigate=useNavigate();
 const hashId=hash.replace(/^#/,'').split('?')[0];
 const redirectedHash=hashId ? qcHashRedirects[hashId] : undefined;
 const normalizedHash=redirectedHash ?? hash;
 const destination=qcDestination(normalizedHash || qcSections.find(s=>canAccessPage(access,'/qc',s.id))?.id || 'overview');
 useEffect(()=>{
  if(!hash || !redirectedHash) return;
  void navigate({to:'/qc',hash:redirectedHash,replace:true});
 },[hash,navigate,redirectedHash]);
 const select=(id:string)=>{if(canAccessPage(access,'/qc',id))void navigate({to:'/qc',hash:id});};
 const tabs=(destination.section==='materials'?materialTabs:destination.section==='problems'?problemTabs:destination.section==='quality'?qualityTabs:[]).filter(t=>canAccessPage(access,'/qc',t.id));
 const isContainer=!normalizedHash||['materials','problems'].includes(normalizedHash);
 const active=isContainer&&!tabs.some(t=>t.id===destination.tab)?tabs[0]?.id:destination.tab;
 let content:React.ReactNode;
 if(!active||!canAccessPage(access,'/qc',active)) content=<p role="alert">Нет доступа к этому инструменту.</p>;
 else if(aiSections[active])content=<AIControlCenter section={aiSections[active]} onSection={id=>select(id==='projects'?'instructions':id)}/>;
 else if(destination.section==='overview')content=<QCOverview onSelect={select}/>;
 else if(destination.section==='inbox')content=<ReviewInbox key={hash} initialFilter={destination.filter} initialItem={destination.item}/>;
 else if(active==='binds')content=<SharedBindsPage/>;
 else if(active==='emails')content=<ProjectEmailsPage management/>;
 else if(active==='bonuses')content=<DepositBonusesPage management/>;
 else if(active==='duplicates')content=<DuplicateKnowledge/>;
 else if(active==='languages')content=<LanguageQuality/>;
 else if(active==='quality')content=<AIQuality/>;
 else if(active==='history')content=<KnowledgeHistory/>;
 return <OperationsWorkspace area="qc" sections={qcSections} active={destination.section} onSelect={select}>
  {tabs.length>0&&<>
   <nav className="qc-tabs" aria-label="Инструменты раздела">{tabs.map(t=><button key={t.id} type="button" className="space-tab" aria-pressed={active===t.id} onClick={()=>select(t.id)}>{t.label}</button>)}</nav>
   <label className="ui-field qc-tab-select">Инструмент<select className="ui-input" value={active} onChange={e=>select(e.target.value)}>{tabs.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}</select></label>
  </>}
  {content}
 </OperationsWorkspace>;
}
