import {describe,it,expect} from 'vitest';
import type {Bind} from '@/entities/bind';
import {reconcileBindLinks,setBindLink} from './bind-links';
const bind=(id:string,slug=id,sourceBindId?:string)=>({id,slug,sourceBindId,translations:[],tags:[],categoryId:'test'}) as Bind;
describe('persistent one-to-one bind matching',()=>{
 it('keeps a saved link after either slug changes',()=>{const links=reconcileBindLinks([bind('base','same')],[bind('local','same')],{});expect(links).toEqual({base:'local'});expect(reconcileBindLinks([bind('base','renamed')],[bind('local','other')],links)).toEqual(links);});
 it('does not guess when either side has duplicate slugs',()=>{expect(reconcileBindLinks([bind('a','same'),bind('b','same')],[bind('local','same')],{})).toEqual({});expect(reconcileBindLinks([bind('a','same')],[bind('x','same'),bind('y','same')],{})).toEqual({});});
 it('reserves explicit identities before matching slugs',()=>{expect(reconcileBindLinks([bind('a','same'),bind('b','other')],[bind('x','same','b')],{})).toEqual({b:'x'});});
 it('does not relink deliberately separated or temporarily missing records',()=>{expect(reconcileBindLinks([bind('a','same')],[bind('new','same')],{a:null})).toEqual({a:null});expect(reconcileBindLinks([bind('a','same')],[bind('new','same')],{a:'missing'})).toEqual({a:'missing'});});
 it('rejects assigning a personal bind twice and permits reassignment after unlink',()=>{expect(()=>setBindLink({a:'x'},'b','x')).toThrow('уже связан');expect(setBindLink(setBindLink({a:'x'},'a',null),'b','x')).toEqual({a:null,b:'x'});});
});
