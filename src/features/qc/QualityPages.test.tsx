// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/store/auth.store';
import type { Bind } from '@/entities/bind';
vi.mock('@tanstack/react-router',()=>({Link:({to,hash,children,...props}:any)=>createElement('a',{...props,href:to+'#'+hash},children)}));
vi.mock('@/services/shared-binds.service',()=>({sharedBindsService:{list:vi.fn(),proposals:vi.fn(),history:vi.fn()}}));
import { QCOverview, ReviewInbox, DuplicateKnowledge, LanguageQuality } from './QualityPages';
const bind:Bind={id:'b',slug:'verification',categoryId:'c',tags:[],translations:[{language:'ru',title:'Верификация',content:'Проверенные сведения о документах клиента',updatedAt:'2026-09-24'}],favorite:false,archived:false,createdAt:'2026-09-24',updatedAt:'2026-09-24'};
function mount(node:React.ReactNode) {
 useAuthStore.setState({session:{accessToken:'test',user:{id:'qc',email:'qc@example.test',role:'qc',access:{status:'active',permissions:['knowledge.write'],roles:[],version:1,display_name:''}}}});
 const client=new QueryClient({defaultOptions:{queries:{retry:false,staleTime:Infinity}}});
 const proposal={id:'p',source_id:'b',author_id:'operator',author:'Оператор',translations:[{...bind.translations[0],content:'Новый проверенный текст'}],tags:[],created_at:'2026-09-24',status:'pending'};
 client.setQueryData(['shared-binds','qc'],[bind,{...bind,id:'duplicate',slug:'copy'}]);
 client.setQueryData(['bind-proposals','qc',undefined],[proposal]);
 client.setQueryData(['bind-proposals','qc','b'],[proposal]);
 client.setQueryData(['quality-signals','qc'],{feedback:[{bind_id:'b',kind:'outdated',updated_at:'2026-09-24'}],gaps:[{id:1,topic:'Сроки проверки',project_id:null,created_at:'2026-09-24'}]});
 return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}
afterEach(()=>{cleanup();useAuthStore.setState({session:undefined});});
it('uses source counts and opens the filtered queue from overview',()=>{
 const select=vi.fn();mount(<QCOverview onSelect={select}/>);
 const card=screen.getByRole('button',{name:/Требуют проверки/});
 expect(within(card).getByText('3')).toBeTruthy();
 expect(within(screen.getByRole('button',{name:/Возможные дубли/})).getByText('1')).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:/Предложения операторов/}));
 expect(select).toHaveBeenCalledWith('proposals');
 expect(screen.queryByText(/AI candidates|confidence|No telemetry/)).toBeNull();
});
it('opens a proposal with its actual diff and safe review actions',()=>{
 mount(<ReviewInbox initialFilter="proposal" initialItem="proposal:p"/>);
 expect(screen.getByText('Новый проверенный текст')).toBeTruthy();
 expect(screen.getByRole('button',{name:'Принять изменение'})).toBeTruthy();
 expect(screen.getByRole('button',{name:'Отклонить'})).toBeTruthy();
 expect(screen.getByRole('button',{name:'Назад к очереди'})).toBeTruthy();
});
it('opens a gap in the same queue with a next action and supports text search',()=>{
 mount(<ReviewInbox initialFilter="gap" initialItem="gap:1"/>);
 expect(screen.getByRole('heading',{name:'Сроки проверки'})).toBeTruthy();
 expect(screen.getByRole('link',{name:'Открыть материалы'}).getAttribute('href')).toBe('/qc#materials');
 fireEvent.click(screen.getByRole('button',{name:'Все'}));
 fireEvent.change(screen.getByRole('textbox',{name:'Поиск очереди'}),{target:{value:'Новый проверенный текст'}});
 expect(screen.getByRole('button',{name:/Предложение оператора/})).toBeTruthy();
});
it('compares duplicate texts and links to each material without deleting',()=>{
 mount(<DuplicateKnowledge/>);fireEvent.click(screen.getByRole('button',{name:'Сравнить'}));
 expect(screen.getAllByRole('link',{name:'Открыть материал'})).toHaveLength(2);
 expect(screen.queryByRole('button',{name:/Удалить/})).toBeNull();
});
it('lists missing translations with material links rather than a quality percentage',()=>{
 mount(<LanguageQuality/>);expect(screen.getAllByText('EN · Нет перевода')).toHaveLength(2);
 expect(screen.getAllByRole('link',{name:'Открыть материал'})).toHaveLength(2);
 fireEvent.change(screen.getByRole('combobox',{name:'Язык перевода'}),{target:{value:'ru'}});
 expect(screen.queryByRole('link',{name:'Открыть материал'})).toBeNull();
});
