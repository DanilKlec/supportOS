// Run on an always-on host; credentials stay in its environment.
const url = process.env.MONITOR_URL;
const secret = process.env.MONITOR_COLLECTOR_SECRET;
if (!url || !secret) throw new Error('Set MONITOR_URL and MONITOR_COLLECTOR_SECRET');
const endpoint = new URL('/api/agent-monitor?action=collect', url);
if(endpoint.protocol !== 'https:' && endpoint.hostname !== 'localhost') throw new Error('HTTPS required');
let stopped=false;
process.on('SIGINT',()=>{stopped=true;});
process.on('SIGTERM',()=>{stopped=true;});
while(!stopped) {
 try {
  const response=await fetch(endpoint,{method:'POST',headers:{Authorization:`Bearer ${secret}`},signal:AbortSignal.timeout(25000)});
  console.log(new Date().toISOString(),response.ok?'Collected':`Collector error: HTTP ${response.status}`);
 } catch {console.error(new Date().toISOString(),'Collector connection failed');}
 if(!stopped) await new Promise(resolve=>setTimeout(resolve,30000));
}
