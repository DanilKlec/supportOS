import { createHash, randomUUID } from 'node:crypto';

export function createFeedbackReview(body, actorId) {
 const sourceIds=[...new Set((Array.isArray(body.sourceIds)?body.sourceIds:[]).filter(id=>typeof id==='string'&&id.trim()).map(id=>id.trim().slice(0,160)))].slice(0,5);
 const answer=typeof body.answer==='string'?body.answer.slice(0,16000):'';
 return {
  id:randomUUID(),
  project_id:typeof body.project==='string'?body.project.trim().slice(0,100):'',
  source_ids:sourceIds,
  comment:typeof body.reason==='string'?body.reason.trim().slice(0,240):'',
  answer_ref:createHash('sha256').update(answer).digest('hex'),
  actor_id:actorId,
 };
}
