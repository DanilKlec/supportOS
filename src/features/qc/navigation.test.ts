import { expect, it } from 'vitest';
import { qcSections } from '@/features/operations/sections';
import { canAccessPage } from '../../../shared/access.js';
import { materialTabs, problemTabs, qualityTabs, qcDestination } from './navigation';
it('has six main destinations and nests all working tools',()=>{
 expect(qcSections.map(s=>s.label)).toEqual(['Обзор','Очередь проверки','Материалы','Проблемы материалов','Проверка AI','История']);
 expect(materialTabs.map(s=>s.id)).toEqual(['binds','emails','bonuses','knowledge','rules','instructions','glossary']);
 expect(problemTabs.map(s=>s.id)).toEqual(['duplicates','languages']);
 expect(qualityTabs.map(s=>s.id)).toEqual(['quality','playground','tests','feedback']);
});
it('preserves legacy hashes and queue selection',()=>{
 for(const [hash,section,tab] of [['proposals','inbox','inbox'],['gaps','inbox','inbox'],['duplicates','problems','duplicates'],['languages','problems','languages'],['knowledge','materials','knowledge'],['rules','materials','rules'],['instructions','materials','instructions'],['playground','quality','playground'],['tests','quality','tests'],['feedback','quality','feedback']])expect(qcDestination(hash)).toMatchObject({section,tab});
 expect(qcDestination('proposals')).toMatchObject({filter:'proposal'});
 expect(qcDestination('gaps')).toMatchObject({filter:'gap'});
 expect(qcDestination('inbox?item=proposal%3Aabc')).toMatchObject({item:'proposal:abc'});
});
it('keeps Support outside QC and respects each nested tool permission',()=>{
 const support={status:'active',permissions:['work','binds.read','projects.read','bonuses.read']};
 for(const id of [...qcSections,...materialTabs,...problemTabs,...qualityTabs].map(s=>s.id))expect(canAccessPage(support,'/qc',id)).toBe(false);
 expect(canAccessPage({status:'active',permissions:['ai.rules']},'/qc','materials')).toBe(true);
 expect(canAccessPage({status:'active',permissions:['ai.rules']},'/qc','knowledge')).toBe(false);
 expect(canAccessPage({status:'active',permissions:['knowledge.write']},'/qc','emails')).toBe(false);
 expect(canAccessPage({status:'active',permissions:['knowledge.write','projects.read']},'/qc','emails')).toBe(true);
 expect(canAccessPage({status:'active',permissions:['knowledge.write']},'/qc','inbox?item=gap%3A1')).toBe(true);
});
