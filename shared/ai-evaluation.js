export function evaluateAIAnswer(answer, test) {
 const normalize = value => String(value ?? '').normalize('NFKC').toLowerCase();
 const text = normalize(answer);
 const missing = (test.required ?? []).filter(term => !text.includes(normalize(term)));
 const forbidden = (test.forbidden ?? []).filter(term => text.includes(normalize(term)));
 return {passed: !missing.length && !forbidden.length, missing, forbidden};
}
