import {it,expect} from 'vitest';
import {inboxItems} from './inbox-items';
import type {Bind} from '@/entities/bind';
const base:Bind={id:'a',slug:'a',translations:[],tags:[],categoryId:'c',favorite:false,archived:false,createdAt:'',updatedAt:'v1'};
it('ignores the initial catalog and includes newer versions and new binds',()=>{expect(inboxItems([base],[],{a:'v1'})).toEqual([]);expect(inboxItems([{...base,updatedAt:'v2'}],[],{a:'v1'})[0].description).toBe('Общая версия обновлена');expect(inboxItems([base],[],{})[0].description).toBe('Новый общий бинд');});
it('uses versioned share keys and removes revoked entries',()=>{const share={id:'s',sourceId:'a',sender:'Alex',bind:base};expect(inboxItems([base],[share],{a:'v1'})[0].key).toBe('share:s:v1');expect(inboxItems([base],[{...share,bind:{...base,updatedAt:'v2'}}],{a:'v1'})[0].key).toBe('share:s:v2');expect(inboxItems([base],[],{a:'v1'})).toEqual([]);});
