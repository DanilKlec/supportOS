// @vitest-environment jsdom
import {it,expect} from 'vitest';
import {renderHook,act,cleanup} from '@testing-library/react';
import {useViewState} from './useViewState';
import {useAuthStore} from '@/store/auth.store';
import {useBonusStore} from '@/store/bonus.store';
it('restores UI filters and isolates accounts and management views',()=>{useAuthStore.setState({session:{user:{id:'a'}} as any});const first=renderHook(()=>useViewState('emails:false','query',''));act(()=>first.result.current[1]('project'));first.unmount();const second=renderHook(()=>useViewState('emails:false','query',''));expect(second.result.current[0]).toBe('project');act(()=>useAuthStore.setState({session:{user:{id:'b'}} as any}));expect(second.result.current[0]).toBe('');cleanup();});
it('keeps the active bonus project through refresh and handles removal',()=>{const a={id:'a',slug:'a',name:'A',bonuses:[],updatedAt:''},b={...a,id:'b',slug:'b',name:'B'};useBonusStore.setState({projects:[a,b],activeProjectId:'b'});useBonusStore.getState().replaceProjects([a,b]);expect(useBonusStore.getState().activeProjectId).toBe('b');useBonusStore.getState().replaceProjects([a]);expect(useBonusStore.getState().activeProjectId).toBe('a');});
