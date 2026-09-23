// @vitest-environment jsdom
import {render,screen,waitFor,cleanup,fireEvent} from '@testing-library/react';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {useAuthStore} from '@/store/auth.store';
const mocks=vi.hoisted(()=>({getAccessToken:vi.fn(async()=>'token'),signOut:vi.fn(async()=>{}),refreshIdentity:vi.fn(async()=>{})}));
vi.mock('@/services/supabase.service',()=>({supabaseService:mocks}));
vi.mock('@/components/brand/AmbientBackground',()=>({AmbientBackground:()=>null}));
import {TelegramTwoFactor} from './TelegramTwoFactor';
beforeEach(()=>{vi.clearAllMocks();useAuthStore.setState({session:{accessToken:'token',sessionId:'session',user:{id:'user',email:'a@test',role:'support'}}});});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
const respond=(data:unknown)=>new Response(JSON.stringify(data));
it('restores a pending challenge after refresh without re-sending or granting access',async()=>{
 const fetch=vi.fn(async(_input:string)=>respond({status:'pending',expiresAt:new Date(Date.now()+60000).toISOString()}));vi.stubGlobal('fetch',fetch);
 render(<TelegramTwoFactor/>);
 await screen.findByText(/Ожидаем подтверждение/);
 expect(fetch).toHaveBeenCalledTimes(1);expect(fetch.mock.calls[0][0]).toContain('2fa-status');
 expect(mocks.refreshIdentity).not.toHaveBeenCalled();
});
it('starts the second factor for an existing unverified session',async()=>{
 const fetch=vi.fn().mockResolvedValueOnce(respond({status:'required'})).mockResolvedValueOnce(respond({status:'pending'}));vi.stubGlobal('fetch',fetch);
 render(<TelegramTwoFactor/>);await waitFor(()=>expect(fetch).toHaveBeenCalledTimes(2));
 expect(fetch.mock.calls[1][0]).toContain('2fa-begin');expect(mocks.refreshIdentity).not.toHaveBeenCalled();
});
it.each(['rejected','expired'])('signs out for %s',async(status)=>{
 vi.stubGlobal('fetch',vi.fn(async()=>respond({status})));render(<TelegramTwoFactor/>);
 await waitFor(()=>expect(mocks.signOut).toHaveBeenCalled());expect(mocks.refreshIdentity).not.toHaveBeenCalled();
});
it('only reloads permissions after server approval',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>respond({status:'approved'})));render(<TelegramTwoFactor/>);
 await waitFor(()=>expect(mocks.refreshIdentity).toHaveBeenCalled());
});
it('shows enrollment awaiting administrator instead of granting access',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>respond({status:'link_review'})));render(<TelegramTwoFactor/>);
 await screen.findByText('Ожидаем администратора');expect(mocks.refreshIdentity).not.toHaveBeenCalled();
 fireEvent.click(screen.getByText('Отменить вход'));await waitFor(()=>expect(mocks.signOut).toHaveBeenCalled());
});
