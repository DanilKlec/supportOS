// @vitest-environment jsdom
import {it,expect,vi} from 'vitest';
import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
const mocks=vi.hoisted(()=>({list:vi.fn(),preview:vi.fn(),publish:vi.fn()}));
vi.mock('@/services/shared-binds.service',()=>({sharedBindsService:{list:mocks.list}}));
vi.mock('@/services/google-sheets.service',()=>({googleSheetsService:{preview:mocks.preview}}));
vi.mock('@/services/shared-content.service',()=>({contentApi:mocks.publish}));
import {CommonBindImport} from './CommonBindImport';
it('publishes only changed rows with the preview version and keeps unchanged rows out',async()=>{
 const translation={language:'ru',title:'Ответ',content:'Было',updatedAt:'old'};
 const existing=[{id:'a',slug:'a',tags:[],translations:[translation],updatedAt:'v1'},{id:'b',slug:'b',tags:[],translations:[translation],updatedAt:'v2'}];
 mocks.list.mockResolvedValue(existing);
 mocks.preview.mockResolvedValue({errors:[],rows:[{...existing[0],errors:[]},{...existing[1],errors:[],translations:[{...translation,content:'Стало'}]}]});
 mocks.publish.mockResolvedValue({});
 render(<QueryClientProvider client={new QueryClient()}><CommonBindImport/></QueryClientProvider>);
 fireEvent.click(screen.getByText('Загрузить базовые бинды для всей команды'));
 fireEvent.change(screen.getByLabelText('Ссылка Google Sheets'),{target:{value:'https://docs.google.com/spreadsheets/d/test'}});
 fireEvent.click(screen.getByRole('button',{name:'Предпросмотр таблицы'}));
 fireEvent.click(await screen.findByRole('button',{name:'Опубликовать 1 изменений'}));
 await waitFor(()=>expect(mocks.publish).toHaveBeenCalled());
 expect(mocks.publish.mock.calls[0][1]).toEqual([expect.objectContaining({id:'b',expected:'v2'})]);
});
