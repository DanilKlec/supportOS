// @vitest-environment jsdom
import {it,expect} from 'vitest';
import {render,screen,fireEvent,cleanup} from '@testing-library/react';
import {MoreActions} from './MoreActions';
it('closes on Escape, outside click and action selection',()=>{render(<MoreActions><button>История</button></MoreActions>);const summary=screen.getByText('Ещё ···'),details=summary.parentElement as HTMLDetailsElement;details.open=true;fireEvent.keyDown(document,{key:'Escape'});expect(details.open).toBe(false);expect(document.activeElement).toBe(summary);details.open=true;fireEvent.pointerDown(document.body);expect(details.open).toBe(false);details.open=true;fireEvent.click(screen.getByText('История'));expect(details.open).toBe(false);cleanup();});
