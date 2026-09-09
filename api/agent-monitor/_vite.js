import { loadEnv } from 'vite';
import handler from './index.js';
export function agentMonitorPlugin() {
 return {name:'supportos-agent-monitor',configureServer(server) {
  const env=loadEnv(server.config.mode,server.config.root,'');
  for(const [key,value] of Object.entries(env)) if(/^(MONITOR_|LIVECHAT_|SUPABASE_)/.test(key)&&process.env[key]===undefined) process.env[key]=value;
  server.middlewares.use(async(req,res,next)=>{
   if(new URL(req.url??'','http://localhost').pathname!=='/api/agent-monitor') return next();
   try {
    let raw='';
    for await(const chunk of req) {raw+=chunk.toString();if(Buffer.byteLength(raw)>65536){res.statusCode=413;res.end('{"error":"Request too large"}');return;}}
    req.body=raw?JSON.parse(raw):{};await handler(req,res);
   } catch {res.statusCode=400;res.end('{"error":"Invalid JSON"}');}
  });
 }};
}
