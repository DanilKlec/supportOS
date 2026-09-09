import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { normalizeStatus, collect, config } from './_server.js';
import handler from './index.js';
const env = { SUPABASE_URL: 'https://test.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'test-public', SUPABASE_SERVICE_ROLE_KEY: 'test-service', LIVECHAT_AUTHORIZATION: 'Basic test', LIVECHAT_ORGANIZATION_ID: 'org', LIVECHAT_WEBHOOK_SECRET: 'webhook-test', MONITOR_COLLECTOR_SECRET: 'collector-test' };
const response = () => ({ headers: {}, setHeader(k,v) { this.headers[k]=v; }, end(value) { this.body=JSON.parse(value); } });
const request = (extra = {}) => ({ method:'GET', url:'/?day=2026-09-08', headers:{authorization:'Bearer user-token',host:'localhost',origin:'http://localhost'}, ...extra });
beforeEach(() => { for (const [key,value] of Object.entries(env)) vi.stubEnv(key,value); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe('monitor server security', () => {
 it('imports with verified actor and rejects unknown agents before saving',async()=>{
  const payload={month:'2026-09',people:['work@example.com'],records:[],username:'forged'};
  const fetch=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({id:'verified',app_metadata:{role:'supervisor'}}))).mockResolvedValueOnce(new Response('[{"id":"work@example.com"}]')).mockResolvedValueOnce(new Response('{"added":0,"removed":1}'));
  vi.stubGlobal('fetch',fetch);const res=response();
  await handler(request({method:'POST',url:'/?action=schedule-import',body:payload}),res);
  expect(res.statusCode).toBe(200);expect(JSON.parse(fetch.mock.calls[2][1].body).username).toBe('verified');
  fetch.mockReset().mockResolvedValueOnce(new Response(JSON.stringify({id:'verified',app_metadata:{role:'supervisor'}}))).mockResolvedValueOnce(new Response('[]'));
  const rejected=response();await handler(request({method:'POST',url:'/?action=schedule-import',body:payload}),rejected);
  expect(rejected.statusCode).toBe(400);expect(fetch).toHaveBeenCalledTimes(2);
 });
 it('fails closed without database configuration', () => { expect(() => config({})).toThrow('Настройте'); });
 it('maps routing status without inventing offline', () => { expect(normalizeStatus('accepting chats')).toBe('on'); expect(normalizeStatus(null)).toBe('unknown'); });
 it('rejects forged legacy cookies before database access', async () => {
  const fetch=vi.fn(); vi.stubGlobal('fetch',fetch); const res=response();
  await handler(request({headers:{cookie:'monitor_session=admin'}}),res);
  expect(res.statusCode).toBe(401); expect(fetch).not.toHaveBeenCalled();
 });
 it('rejects invalid bearer tokens', async () => {
  const fetch=vi.fn().mockResolvedValue(new Response('{}',{status:401})); vi.stubGlobal('fetch',fetch); const res=response();
  await handler(request(),res); expect(res.statusCode).toBe(401); expect(fetch).toHaveBeenCalledTimes(1);
 });
 it('does not trust user_metadata supervisor roles', async () => {
  const fetch=vi.fn().mockResolvedValue(new Response(JSON.stringify({id:'ordinary',app_metadata:{role:'user'},user_metadata:{role:'admin'}}))); vi.stubGlobal('fetch',fetch); const res=response();
  await handler(request(),res); expect(res.statusCode).toBe(403); expect(fetch).toHaveBeenCalledTimes(1);
 });
 it('records the verified supervisor id, ignoring a forged actor in the body', async () => {
  const fetch=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({id:'supervisor-uuid',app_metadata:{role:'supervisor'}}))).mockResolvedValueOnce(new Response('null')); vi.stubGlobal('fetch',fetch); const res=response();
  await handler(request({method:'POST',url:'/?action=assignment&day=2026-09-08',body:{agentId:'a',shift:'night',enabled:true,username:'forged'}}),res);
  expect(res.statusCode).toBe(200); expect(JSON.parse(fetch.mock.calls[1][1].body).username).toBe('supervisor-uuid');
  expect(fetch.mock.calls[0][0]).toContain('/auth/v1/user');
  expect(fetch.mock.calls[0][1].headers.apikey).toBe('test-public');
 });
 it('rejects cross-origin writes', async () => {const res=response();await handler(request({method:'POST',headers:{origin:'https://evil.example',host:'localhost'},url:'/?action=assignment'}),res);expect(res.statusCode).toBe(403);});
 it('rejects wrong webhook secrets and foreign organizations', async () => {
  const fetch=vi.fn(); vi.stubGlobal('fetch',fetch);
  for(const body of [{secret_key:'wrong',organization_id:'org'},{secret_key:env.LIVECHAT_WEBHOOK_SECRET,organization_id:'other'}]) {
   const res=response();await handler(request({method:'POST',url:'/?action=webhook',body}),res);expect(res.statusCode).toBe(401);
  } expect(fetch).not.toHaveBeenCalled();
 });
 it('does not accept a user bearer token as the collector secret',async()=>{const res=response();await handler(request({method:'POST',url:'/?action=collect'}),res);expect(res.statusCode).toBe(401);});
 it('never converts a missing agent status to offline',async()=>{
  const fetch=vi.fn().mockResolvedValueOnce(new Response('true')).mockResolvedValueOnce(new Response('[{"id":"a","name":"Agent"}]')).mockResolvedValueOnce(new Response('[]')).mockResolvedValueOnce(new Response('null')).mockResolvedValueOnce(new Response('null'));
  vi.stubGlobal('fetch',fetch);await collect(env);expect(JSON.parse(fetch.mock.calls[3][1].body).rows[0].status).toBe('unknown');
 });
});
