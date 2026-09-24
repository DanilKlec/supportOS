const optionalDate=v=>v===undefined||v===''||(typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v);
const validFreshness=b=>optionalDate(b.validUntil)&&optionalDate(b.reviewDue)&&(b.responsible===undefined||(typeof b.responsible==='string'&&b.responsible.length<=120))&&(b.checkedAt===undefined||b.checkedAt===''||(typeof b.checkedAt==='string'&&b.checkedAt.length<=40&&Number.isFinite(Date.parse(b.checkedAt))));
const validEmails = r => {
 const validEmail=v=>typeof v==='string'&&v.length<=320&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
 if(r.emails!==undefined)return Array.isArray(r.emails)&&r.emails.length<=100&&new Set(r.emails.map(e=>e?.id)).size===r.emails.length&&r.emails.every(e=>e&&typeof e.id==='string'&&e.id.length>0&&e.id.length<=200&&typeof e.type==='string'&&e.type.trim().length>0&&e.type.length<=100&&validEmail(e.email)&&(e.note===undefined||typeof e.note==='string'&&e.note.length<=2000));
 return ['supportEmail','kycEmail','vipEmail'].every(k=>typeof r[k]==='string'&&(!r[k]||validEmail(r[k])));
};
const text = (v) => typeof v === 'string';
const list = (v) => Array.isArray(v) && v.length <= 1000;
export function validContent(kind, rows) {
 if (!list(rows) || new Set(rows.map(r=>r?.id)).size !== rows.length) return false;
 return rows.every(r => r && text(r.id) && r.id.length>0 && r.id.length<=200 && text(r.slug) && (
  kind==='emails' ? text(r.projectName) && validEmails(r) :
  kind==='bonuses' ? text(r.name) && list(r.bonuses) && r.bonuses.every(b=>b && validFreshness(b) && text(b.id)&&text(b.name)&&text(b.content)&&Number.isFinite(b.order) && (b.translations===undefined || (list(b.translations)&&b.translations.every(t=>text(t?.language)&&text(t?.content))))) :
  kind==='bonus-tools' ? rows.length===1 && text(r.sourceUrl)&&text(r.loadedAt)&&list(r.warnings)&&r.warnings.every(text)&&list(r.rules)&&r.rules.every(b=>b&&['id','group','site','welcomeWager','welcomeMaxWin','noDeposit','retentionWager','retentionMaxWin','events','map','note','searchText'].every(k=>text(b[k])))&&list(r.currencyTables)&&r.currencyTables.every(t=>t&&text(t.name)&&list(t.currencies)&&t.currencies.every(text)&&list(t.rows)&&t.rows.every(v=>v&&text(v.base)&&v.values&&typeof v.values==='object'&&Object.values(v.values).every(text))) :
  kind==='binds' ? list(r.tags)&&r.tags.every(text)&&list(r.translations)&&r.translations.length>0&&new Set(r.translations.map(t=>t?.language)).size===r.translations.length&&r.translations.every(t=>t&&text(t.language)&&t.language.trim()&&text(t.title)&&t.title.trim()&&text(t.content)&&t.content.trim()) && (r.expected===null || (text(r.expected)&&Number.isFinite(Date.parse(r.expected)))) : false
 ));
}
