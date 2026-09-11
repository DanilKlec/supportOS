import { loadEnv } from 'vite';
import handler from './index.js';
import accounts from '../accounts/index.js';
import knowledge from '../ai/knowledge.js';
import binds from '../binds/index.js';
import content from '../content/index.js';
export function agentMonitorPlugin() {
 return {name:'supportos-agent-monitor',configureServer(server) {
  const env=loadEnv(server.config.mode,server.config.root,'');
  for(const [key,value] of Object.entries(env)) if(/^(MONITOR_|LIVECHAT_|SUPABASE_)/.test(key)&&process.env[key]===undefined) process.env[key]=value;
  server.middlewares.use(async(req,res,next)=>{
   const path=new URL(req.url??'','http://localhost').pathname;
   if(!['/api/agent-monitor','/api/accounts','/api/ai/knowledge','/api/binds','/api/content'].includes(path)) return next();
   try {
    let raw='';
    for await(const chunk of req) {raw+=chunk.toString();if(Buffer.byteLength(raw)>4000000){res.statusCode=413;res.end('{"error":"Request too large"}');return;}}
    req.body=raw?JSON.parse(raw):{};await (path==='/api/content'?content:path==='/api/binds'?binds:path==='/api/accounts'?accounts:path==='/api/ai/knowledge'?knowledge:handler)(req,res);
   } catch {res.statusCode=400;res.end('{"error":"Invalid JSON"}');}
  });
 }};
}
