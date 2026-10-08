const TEXT_FIELDS = ['customerMessage', 'context', 'referenceAnswer', 'agentInstructions'];

const credentialPatterns = [
 /\b(?:password|passcode|secret|api[ _-]?key|access[ _-]?token|refresh[ _-]?token|парол(?:ь|я)|секрет(?:ный)?\s*ключ|ключ\s*api|токен\s*доступа)\s*(?:is|=|:|—|-)\s*[^\s,;]+/iu,
 /\b(?:sk|rk|pk)_[a-z0-9_-]{16,}\b/iu,
 /\beyJ[a-z0-9_-]{10,}\.[a-z0-9_-]{10,}\.[a-z0-9_-]{10,}\b/iu,
 /\bgh[pousr]_[a-z0-9]{20,}\b/iu,
];

function digits(value) {
 return value.replace(/\D/g, '');
}

function luhn(value) {
 const valueDigits = digits(value);
 if (valueDigits.length < 13 || valueDigits.length > 19) return false;
 let sum = 0;
 for (let index = valueDigits.length - 1, parity = 0; index >= 0; index--, parity ^= 1) {
  let digit = Number(valueDigits[index]);
  if (parity) digit = digit > 4 ? digit * 2 - 9 : digit * 2;
  sum += digit;
 }
 return sum % 10 === 0;
}

function mask(value, label) {
 const valueDigits = digits(value);
 return `[${label} ****${valueDigits.slice(-4)}]`;
}

function redactText(value) {
 let text = String(value ?? '');
 for (const pattern of credentialPatterns) {
  if (pattern.test(text)) return {blocked: true, text: ''};
 }

 text = text.replace(/\b(?:\d[ -]?){13,19}\b/g, value => luhn(value) ? mask(value, 'CARD') : value);
 text = text.replace(/\b(?:cvv|cvc|код\s*(?:cvv|cvc))\s*(?:is|=|:|—|-)?\s*\d{3,4}\b/giu, '[CVV REDACTED]');
 text = text.replace(/\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]){11,30}\b/gu, value => mask(value, 'IBAN'));
 text = text.replace(/\b(?:iban|bank\s+account|account\s+number|р\/с|сч[её]т)\s*(?:is|=|:|—|-)?\s*[A-Z0-9 -]{8,34}\b/giu, value => {
  const number = value.match(/[A-Z0-9][A-Z0-9 -]*$/iu)?.[0] ?? value;
  return mask(number, 'BANK DETAILS');
 });
 text = text.replace(/(?:passport|паспорт|national\s*id|document\s*(?:number|id)|номер\s*документа)\s*(?:is|=|:|№|#|—|-)?\s*[A-Z0-9-]{5,}\b/giu, value => value.replace(/[A-Z0-9-]{5,}$/iu, '[DOCUMENT REDACTED]'));
 text = text.replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[IDENTIFIER REDACTED]');
 return {blocked: false, text};
}

/**
 * Produces a provider-safe copy. It never logs, returns, or puts original
 * sensitive values into errors; credentials block the outbound request.
 */
export function preflightAIRequest(body) {
 const safe = {...body};
 for (const field of TEXT_FIELDS) {
  if (typeof body?.[field] !== 'string') continue;
  const result = redactText(body[field]);
  if (result.blocked) {
   throw Object.assign(new Error('Запрос содержит пароль, секрет или токен. Удалите его и повторите попытку.'), {status: 422, code: 'SENSITIVE_CREDENTIAL'});
  }
  safe[field] = result.text;
 }
 return safe;
}
