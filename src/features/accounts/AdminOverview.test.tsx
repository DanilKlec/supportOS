// @vitest-environment jsdom
import {it,expect,vi} from 'vitest';
import {render,screen,waitFor} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {useAuthStore} from '@/store/auth.store';
const fetcher=vi.hoisted(()=>vi.fn());
vi.mock('@/services/authenticated-fetch',()=>({authenticatedFetch:fetcher}));
vi.mock('@tanstack/react-router',()=>({useNavigate:()=>vi.fn()}));
import {AdminOverview,needsAccess} from './AdminOverview';
it('does not classify disabled accounts as waiting for access',()=>{const base={id:'a',email:'a',display_name:'',version:1,roles:[]};expect(needsAccess({...base,status:'disabled'})).toBe(false);expect(needsAccess({...base,status:'pending'})).toBe(true);expect(needsAccess({...base,status:'active'})).toBe(true);expect(needsAccess({...base,status:'active',roles:['support']})).toBe(false);});
it('loads accounts without requesting integrations outside current permissions',async()=>{
 useAuthStore.setState({session:{user:{id:'admin',access:{status:'active',permissions:['users.manage'],roles:[]}}} as any});
 fetcher.mockResolvedValue({ok:true,json:async()=>({users:[],total:0})});
 render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><AdminOverview onUser={()=>{}} onAudit={()=>{}}/></QueryClientProvider>);
 await waitFor(()=>expect(screen.getByText('В загруженном списке нет аккаунтов, ожидающих доступа.')).toBeTruthy());
 expect(fetcher.mock.calls.every(([url])=>url.startsWith('/api/accounts'))).toBe(true);
});
