import {config,db} from '../agent-monitor/_server.js';
export async function readGuidance(){
 const rows=await db(config(),'supportos_ai_guidance?select=content,updated_at&id=eq.main');
 return rows[0]??{content:'',updated_at:null};
}
