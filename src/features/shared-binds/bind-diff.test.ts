import {it,expect} from 'vitest';
import {bindChange,changedText} from './bind-diff';
const base={slug:'a',tags:['x','y'],translations:[{language:'ru',title:'Привет',content:'Бонус 10%'},{language:'en',title:'Hello',content:'10%'}]};
it('ignores ordering and translation timestamps but detects real edits',()=>{expect(bindChange(base,{...base,tags:['y','x'],translations:[...base.translations].reverse()})).toBe('unchanged');expect(bindChange(base,{...base,translations:base.translations.slice(0,1)})).toBe('changed');expect(bindChange(base,{...base,slug:'b'})).toBe('changed');expect(bindChange(undefined,base)).toBe('added');});
it('reconstructs both original texts including empty and large strings',()=>{for(const [before,after] of [['Бонус 10%','Бонус 20%'],['','new'],['old',''],['same','same'],['a'.repeat(100000)+'x','a'.repeat(100000)+'y']]){const d=changedText(before,after);expect(d.prefix+d.removed+d.suffix).toBe(before);expect(d.prefix+d.added+d.suffix).toBe(after);}});
