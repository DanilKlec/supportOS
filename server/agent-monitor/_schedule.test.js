import {expect,it} from 'vitest';
import {validateSchedule} from './_schedule.js';
const valid={month:'2026-09',people:['work@example.com'],records:[{day:'2026-09-01',email:'work@example.com',shift:'day'}]};
it('validates the entire payload before database writes',()=>{
 expect(validateSchedule(valid)).toEqual(valid);
 for(const records of [[{...valid.records[0],day:'2026-09-31'}],[{...valid.records[0],day:'2026-10-01'}],[{...valid.records[0],email:'other@example.com'}],[{...valid.records[0],shift:'invalid'}],[...valid.records,...valid.records]]) expect(()=>validateSchedule({...valid,records})).toThrow();
 expect(()=>validateSchedule({...valid,people:[]})).toThrow();
 expect(validateSchedule({...valid,records:[]}).records).toEqual([]);
});
