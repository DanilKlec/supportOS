import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {afterAll,beforeAll,beforeEach,describe,expect,it} from 'vitest';
import {intervals} from '../../src/features/agent-monitor/live-model';
const pg=new PGlite();
beforeAll(async()=>{
 await pg.exec('create role anon; create role authenticated; create role service_role bypassrls;');
 const sql=await readFile(new URL('../../supabase/agent-monitor.sql',import.meta.url),'utf8');
 await pg.exec(sql);await pg.exec(sql); // migration is repeatable
},30000);
beforeEach(async()=>{await pg.exec('reset role; truncate monitor_observations,monitor_assignments,monitor_assignment_audit,monitor_agents,monitor_control restart identity cascade;');});
afterAll(async()=>{await pg.close();});
const ingest=(at,status='on',source='poll')=>pg.query('select monitor_ingest($1::jsonb,$2::timestamptz,$3)',[JSON.stringify([{id:'a',name:'Agent',status}]),at,source]);
describe('Postgres monitor persistence',()=>{
 it('serializes transitions and ignores stale poll results',async()=>{
  await ingest('2026-09-08T06:00:00Z');await ingest('2026-09-08T06:00:30Z');
  await ingest('2026-09-08T06:01:00Z','off','webhook');
  await ingest('2026-09-08T06:00:45Z','on');
  const rows=(await pg.query('select status,changed from monitor_observations order by id')).rows;
  expect(rows).toEqual([{status:'on',changed:true},{status:'on',changed:false},{status:'off',changed:true}]);
  expect((await pg.query('select status from monitor_agents')).rows[0].status).toBe('off');
 });
 it('records assignment changes with actor and avoids duplicate audit entries',async()=>{
  await ingest('2026-09-08T06:00:00Z');
  for(let i=0;i<2;i++)await pg.query("select monitor_assign('2026-09-08','a','night',true,'supervisor')");
  await pg.query("select monitor_assign('2026-09-08','a','night',false,'supervisor')");
  expect((await pg.query('select operation,actor from monitor_assignment_audit order by id')).rows).toEqual([{operation:'assigned',actor:'supervisor'},{operation:'removed',actor:'supervisor'}]);
 });
 it('prevents parallel collectors and enforces login limit',async()=>{
  expect((await pg.query("select monitor_lock('collect',20) as value")).rows[0].value).toBe(true);
  expect((await pg.query("select monitor_lock('collect',20) as value")).rows[0].value).toBe(false);
  for(let i=0;i<10;i++)expect((await pg.query("select monitor_login_limit('login:test') as value")).rows[0].value).toBe(true);
  expect((await pg.query("select monitor_login_limit('login:test') as value")).rows[0].value).toBe(false);
 });
 it('denies browser roles access to events and security-definer functions',async()=>{
  await pg.exec('set role authenticated');
  await expect(pg.query('select * from monitor_agents')).rejects.toThrow('permission denied');
  await expect(pg.query("select monitor_assign('2026-09-08','a','night',true,'forged')")).rejects.toThrow('permission denied');
  await expect(pg.query("select monitor_report('2026-09-08',now())")).rejects.toThrow('permission denied');
  await pg.exec('reset role');
 });
 it('matches independently computed coverage for all shifts, gaps and midnight',async()=>{
  for(const [at,status] of [['2026-09-08T05:59:30Z','on'],['2026-09-08T06:00:30Z','off'],['2026-09-08T13:00:00Z','on'],['2026-09-08T13:00:30Z','offline'],['2026-09-08T20:00:00Z','on'],['2026-09-09T05:59:00Z','off']])await ingest(at,status);
  const observations=(await pg.query('select * from monitor_observations')).rows.map(row=>({...row,at:row.at.toISOString()}));
  const now=Date.parse('2026-09-09T06:00:00Z');
  const rows=(await pg.query("select * from monitor_report('2026-09-08',$1)",[new Date(now).toISOString()])).rows;
  for(const row of rows){
   const expected=intervals(observations,'a','2026-09-08',row.shift,now);
   expect({on:Number(row.on_ms),off:Number(row.off_ms),offline:Number(row.offline_ms),unknown:Number(row.unknown_ms)}).toEqual(expected);
  }
 });
 it('does not count future shifts as unknown elapsed time',async()=>{
  await ingest('2026-09-08T06:00:00Z');
  const rows=(await pg.query("select * from monitor_report('2026-09-09','2026-09-08T06:01:00Z')")).rows;
  for(const row of rows)expect(Number(row.on_ms)+Number(row.off_ms)+Number(row.offline_ms)+Number(row.unknown_ms)).toBe(0);
 });
});
