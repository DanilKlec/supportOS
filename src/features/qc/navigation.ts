export const materialTabs = [
 {id:'binds',label:'Бинды'}, {id:'emails',label:'Почты'}, {id:'bonuses',label:'Welcome-бонусы'},
 {id:'knowledge',label:'AI знания'}, {id:'rules',label:'Правила ответов'},
 {id:'instructions',label:'Инструкции проектов'}, {id:'glossary',label:'Глоссарий'},
];
export const problemTabs = [{id:'duplicates',label:'Дубли'},{id:'languages',label:'Переводы'}];
export const qualityTabs = [{id:'quality',label:'Обзор'},{id:'playground',label:'Проверка ответа'},{id:'tests',label:'Тесты'},{id:'feedback',label:'Отзывы операторов'}];
export function qcDestination(hash: string) {
 const [id, query=''] = hash.replace(/^#/,'').split('?');
 const params = new URLSearchParams(query);
 const filter = id==='proposals'?'proposal':id==='gaps'?'gap':id==='outdated'?'outdated':params.get('type')||'all';
 if (['inbox','proposals','gaps','outdated'].includes(id)) return {section:'inbox',tab:'inbox',filter,item:params.get('item')||''};
 if (id==='materials'||materialTabs.some(t=>t.id===id)) return {section:'materials',tab:id==='materials'?'binds':id,filter,item:''};
 if (id==='problems'||problemTabs.some(t=>t.id===id)) return {section:'problems',tab:id==='problems'?'duplicates':id,filter,item:''};
 if (qualityTabs.some(t=>t.id===id)) return {section:'quality',tab:id,filter,item:''};
 return {section:id==='history'?'history':'overview',tab:id==='history'?'history':'overview',filter,item:''};
}
