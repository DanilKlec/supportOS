const text = (v) => typeof v === 'string';
const list = (v) => Array.isArray(v) && v.length <= 1000;
export function validContent(kind, rows) {
 if (!list(rows) || new Set(rows.map(r=>r?.id)).size !== rows.length) return false;
 return rows.every(r => r && text(r.id) && r.id.length>0 && r.id.length<=200 && text(r.slug) && (
  kind==='emails' ? text(r.projectName) && ['supportEmail','kycEmail','vipEmail'].every(k=>text(r[k]) && (!r[k] || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r[k]))) :
  kind==='bonuses' ? text(r.name) && list(r.bonuses) && r.bonuses.every(b=>b && text(b.id)&&text(b.name)&&text(b.content)&&Number.isFinite(b.order) && (b.translations===undefined || (list(b.translations)&&b.translations.every(t=>text(t?.language)&&text(t?.content))))) :
  kind==='bonus-tools' ? rows.length===1 && text(r.sourceUrl)&&text(r.loadedAt)&&list(r.warnings)&&r.warnings.every(text)&&list(r.rules)&&r.rules.every(b=>b&&['id','group','site','welcomeWager','welcomeMaxWin','noDeposit','retentionWager','retentionMaxWin','events','map','note','searchText'].every(k=>text(b[k])))&&list(r.currencyTables)&&r.currencyTables.every(t=>t&&text(t.name)&&list(t.currencies)&&t.currencies.every(text)&&list(t.rows)&&t.rows.every(v=>v&&text(v.base)&&v.values&&typeof v.values==='object'&&Object.values(v.values).every(text))) :
  kind==='binds' ? list(r.tags)&&r.tags.every(text)&&list(r.translations)&&r.translations.length>0&&new Set(r.translations.map(t=>t?.language)).size===r.translations.length&&r.translations.every(t=>t&&text(t.language)&&t.language.trim()&&text(t.title)&&t.title.trim()&&text(t.content)&&t.content.trim()) && (r.expected===null || (text(r.expected)&&Number.isFinite(Date.parse(r.expected)))) : false
 ));
}
