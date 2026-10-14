const normalize = value => String(value ?? '').normalize('NFKC').toLowerCase();
const stopwords = new Set('the and for with that this from have has are was were what when where how please help about your you can could would should мне меня мой моя мои это как что где когда почему для при или без уже ещё еще пожалуйста подскажите'.split(' '));
const tokens = value => [...new Set(normalize(value).match(/[\p{L}\p{N}]{3,}/gu) ?? [])].filter(word => !stopwords.has(word));
/** Local lexical retrieval over approved records; never searches drafts in production. */
export function rankKnowledge(entries, message, related = new Set()) {
 const query = tokens(message);
 return entries.map(entry => {
  const title = normalize(entry.title), content = normalize(entry.content), category = normalize(entry.category);
  const matched = query.filter(word => title.includes(word) || content.includes(word) || category.includes(word));
  const score = matched.reduce((total, word) => total + (title.includes(word) ? 5 : 0) + (category.includes(word) ? 3 : 0) + (content.includes(word) ? 1 : 0), 0);
  return { entry, score, related: related.has(entry.id) };
 }).filter(item => !query.length || item.related || item.score > 0)
 .sort((a, b) => Number(b.related) - Number(a.related) || b.score - a.score || (b.entry.priority ?? 0) - (a.entry.priority ?? 0))
 .map(item => item.entry);
}
