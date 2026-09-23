// @vitest-environment jsdom
import {render,screen,fireEvent,cleanup,waitFor} from '@testing-library/react';
import {afterEach,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({getAccessToken:vi.fn(async()=>'token'),signOut:vi.fn(async()=>{})}));
vi.mock('@/services/supabase.service',()=>({supabaseService:mocks}));
import {TelegramPassword} from './TelegramPassword';
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.clearAllMocks();});
it('keeps the password form hidden until Telegram approval',async()=>{
 const fetch=vi.fn(async(_input:string,_init?:RequestInit)=>new Response(JSON.stringify({browserToken:'proof',telegramUrl:'https://t.me/GetSupportOSBot',expiresAt:new Date(Date.now()+300000).toISOString(),status:'pending'})));
 vi.stubGlobal('fetch',fetch);render(<TelegramPassword mode="recovery"/>);
 fireEvent.change(screen.getByLabelText('Логин или email'),{target:{value:'user'}});
 fireEvent.click(screen.getByText('Подтвердить через Telegram'));
 await screen.findByText('Открыть Telegram');
 expect(screen.queryByLabelText('Новый пароль')).toBeNull();
 expect(mocks.getAccessToken).not.toHaveBeenCalled();
 expect(JSON.parse(fetch.mock.calls[0][1]?.body as string)).toEqual({mode:'recovery',login:'user'});
});
it('submits a new password only after approval and signs out after completion',async()=>{
 const fetch=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({browserToken:'proof',status:'approved'}))).mockResolvedValueOnce(new Response(JSON.stringify({status:'completed'})));
 vi.stubGlobal('fetch',fetch);render(<TelegramPassword mode="change"/>);
 fireEvent.click(screen.getByText('Подтвердить через Telegram'));
 fireEvent.change(await screen.findByLabelText('Новый пароль'),{target:{value:'long-new-password'}});
 fireEvent.change(screen.getByLabelText('Повторите пароль'),{target:{value:'long-new-password'}});
 fireEvent.click(screen.getByText('Сохранить новый пароль'));
 await waitFor(()=>expect(mocks.signOut).toHaveBeenCalled());
 expect(fetch.mock.calls[1][0]).toContain('password-complete');
 expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({browserToken:'proof',password:'long-new-password'});
});

