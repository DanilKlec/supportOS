import {config,db} from '../agent-monitor/_server.js';
export async function readGuidance(){
 const rows=await db(config(),'supportos_ai_guidance?select=content,document,version,updated_at&id=eq.main');
 return rows[0]??{content:'',document:{entries:[],feedback:[]},version:1,updated_at:null};
}
