const normalize = value => String(value ?? '').normalize('NFKC').toLowerCase().trim();
export function evaluateAIAnswer(answer, test) {
 const text = normalize(answer);
 const required = (test.required ?? []).filter(term => normalize(term));
 const prohibited = (test.forbidden ?? []).filter(term => normalize(term));
 const missing = required.filter(term => !text.includes(normalize(term)));
 const forbidden = prohibited.filter(term => text.includes(normalize(term)));
 const configured = required.length + prohibited.length > 0;
 return {passed: Boolean(text) && configured && !missing.length && !forbidden.length, missing, forbidden, configured, empty: !text};
}
