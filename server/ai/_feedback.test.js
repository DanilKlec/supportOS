import { expect, it } from 'vitest';
import { createFeedbackReview } from './_feedback.js';

it('stores a hashed answer reference and only minimal QC review metadata', () => {
 const review = createFeedbackReview({project:'project-a',reason:'Не тот язык',answer:'Synthetic customer email test@example.com',sourceIds:['bind-1','bind-1','bind-2']},'00000000-0000-4000-8000-000000000001');
 expect(review).toMatchObject({project_id:'project-a',comment:'Не тот язык',source_ids:['bind-1','bind-2'],actor_id:'00000000-0000-4000-8000-000000000001'});
 expect(review.answer_ref).toMatch(/^[a-f0-9]{64}$/);
 expect(JSON.stringify(review)).not.toContain('test@example.com');
});
