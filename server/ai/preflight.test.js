import { expect, it } from 'vitest';
import { preflightAIRequest } from './preflight.js';

it('blocks synthetic passwords, API keys, and access tokens without exposing them', () => {
 for (const customerMessage of [
  'Пароль: synthetic-password-123',
  'api_key=sk_test_abcdefghijklmnopqrstu',
  'access token: eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.signaturevalue',
 ]) {
  expect(() => preflightAIRequest({customerMessage})).toThrow('Запрос содержит пароль, секрет или токен');
  try { preflightAIRequest({customerMessage}); } catch (error) { expect(error.message).not.toContain(customerMessage); }
 }
});

it('masks synthetic payment, banking, and document values before provider use', () => {
 const safe = preflightAIRequest({
  customerMessage: 'Карта 4242 4242 4242 4242, CVV: 123, IBAN GB82 WEST 1234 5698 7654 32, паспорт: AB1234567, SSN 123-45-6789',
 });
 expect(safe.customerMessage).toContain('[CARD ****4242]');
 expect(safe.customerMessage).toContain('[CVV REDACTED]');
 expect(safe.customerMessage).toContain('[IBAN ****5432]');
 expect(safe.customerMessage).toContain('[DOCUMENT REDACTED]');
 expect(safe.customerMessage).toContain('[IDENTIFIER REDACTED]');
 expect(safe.customerMessage).not.toContain('4242 4242 4242 4242');
 expect(safe.customerMessage).not.toContain('GB82 WEST 1234 5698 7654 32');
});

it('does not block a harmless request to reset a password', () => {
 expect(preflightAIRequest({customerMessage: 'Как сбросить пароль от аккаунта?'}).customerMessage).toBe('Как сбросить пароль от аккаунта?');
});
