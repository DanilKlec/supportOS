// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {useAuthStore} from '@/store/auth.store';
const mocks=vi.hoisted(()=>({navigate:vi.fn()}));
vi.mock('@tanstack/react-router',()=>({useNavigate:()=>mocks.navigate,useRouterState:()=>'/'}));
vi.mock('@/shared/hooks/useToast',()=>({useToast:()=>({showToast:vi.fn()})}));
import {ToolsMenu} from './ToolsMenu';
afterEach(()=>{cleanup();vi.clearAllMocks();});
function setup(permissions:string[]){
 useAuthStore.setState({session:{accessToken:'test',user:{id:'test',email:'test@example.com',role:'support',access:{status:'active',roles:[],permissions,version:1,display_name:''}}} as any});
 const root=document.createElement('div');root.id='app';document.body.append(root);
 render(<ToolsMenu/>,{container:root});fireEvent.click(screen.getByRole('button',{name:'Открыть меню пространства'}));return root;
}
it('groups allowed routes, searches and hides administration from Support',()=>{
 setup(['work','binds.read','tools']);
 expect(screen.getByRole('dialog')).toBeTruthy();
 expect(screen.queryByText('Пользователи и роли')).toBeNull();
 expect(screen.queryByText('Восстановить локальную копию')).toBeNull();
 expect(screen.queryByText('Общая база')).toBeNull();
 expect(screen.getByText('Бинды')).toBeTruthy();
 fireEvent.change(screen.getByRole('textbox'),{target:{value:'Спортивные'}});
 expect(screen.queryByText('Бинды')).toBeNull();
 fireEvent.click(screen.getByText('Спортивные ставки'));
 expect(mocks.navigate).toHaveBeenCalledWith({to:'/sports-betting',hash:''});
 expect(screen.queryByRole('dialog')).toBeNull();
});
it('traps keyboard focus, closes with Escape and restores the page',()=>{
 const root=setup(['work','binds.read','users.manage','knowledge.write']);
 expect(root.inert).toBe(true);
 expect(document.activeElement).toBe(screen.getByRole('textbox'));
 const close=screen.getByRole('button',{name:'Закрыть меню'});close.focus();
 fireEvent.keyDown(close,{key:'Tab',shiftKey:true});
 expect(document.activeElement).toBe(screen.getByRole('button',{name:/анимацию фона/}));
 fireEvent.keyDown(document.activeElement!,{key:'Escape'});
 expect(screen.queryByRole('dialog')).toBeNull();
 expect(root.inert).toBe(false);
 expect(document.activeElement).toBe(screen.getByRole('button',{name:'Открыть меню пространства'}));
});
