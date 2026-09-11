import {expect,it} from 'vitest';
import {useKnowledgeStore} from './knowledge.store';
it('opens, switches and pins remote binds without adding them to the editable local snapshot',()=>{
 const previous=useKnowledgeStore.getState();
 const remote={id:'remote',slug:'remote',translations:[],tags:[],categoryId:'shared',favorite:false,archived:false,createdAt:'',updatedAt:''};
 try {
  useKnowledgeStore.setState({binds:[],remoteBinds:[remote],openedTabs:[],pinnedTabs:[],activeTab:undefined});
  const store=useKnowledgeStore.getState();store.openBind('remote');
  expect(useKnowledgeStore.getState().activeTab).toBe('remote');
  expect(useKnowledgeStore.getState().binds).toEqual([]);
  store.setKnowledge({search:'query'});
  expect(useKnowledgeStore.getState().openedTabs).toEqual(['remote']);
  store.togglePinnedTab('remote');store.closeTab('remote');
  expect(useKnowledgeStore.getState().openedTabs).toEqual(['remote']);
  store.togglePinnedTab('remote');store.closeTab('remote');
  expect(useKnowledgeStore.getState().openedTabs).toEqual([]);
 }finally{useKnowledgeStore.setState(previous);}
});
