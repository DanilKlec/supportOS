import { loadEnv } from 'vite';
import accounts from './accounts/index.js';
import knowledge from './ai/knowledge.js';
import glossary from './ai/glossary.js';
import binds from './binds/index.js';
import content from './content/index.js';
import projects from './projects/index.js';
import registration from './registration/index.js';

const routes = new Map([
 ['/api/accounts', accounts],
 ['/api/ai/knowledge', knowledge],
 ['/api/ai/glossary', glossary],
 ['/api/binds', binds],
 ['/api/content', content],
 ['/api/projects', projects],
 ['/api/registration', registration],
]);
export function workspaceApiPlugin() {
 return {name:'supportos-workspace-api',configureServer(server) {
  const env=loadEnv(server.config.mode,server.config.root,'');
  for(const [key,value] of Object.entries(env)) if(/^(SUPABASE_|SECURITY_AUDIT_SECRET$)/.test(key)&&process.env[key]===undefined) process.env[key]=value;
  server.middlewares.use(async(req,res,next)=>{
   const path=new URL(req.url??'','http://localhost').pathname;
   const handler=routes.get(path);
   if(!handler) return next();
   try {
    let raw='';
    for await(const chunk of req) {raw+=chunk.toString();if(Buffer.byteLength(raw)>4000000){res.statusCode=413;res.end('{"error":"Request too large"}');return;}}
    req.body=raw?JSON.parse(raw):{};await handler(req,res);
   } catch {res.statusCode=400;res.end('{"error":"Invalid JSON"}');}
  });
 }};
}
