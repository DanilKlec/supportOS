const suffix = '@telegram.supportos.invalid';
export function normalizeLogin(value) {
 const login = typeof value === 'string' ? value.trim().toLowerCase() : '';
 if (!/^[a-z][a-z0-9_]{3,31}$/.test(login)) throw new Error('Логин: 4–32 символа, латинские буквы, цифры и подчёркивание; начните с буквы.');
 return login;
}
export function loginEmail(value) {
 const input = value.trim();
 return input.includes('@') ? input : `${normalizeLogin(input)}${suffix}`;
}
export function displayIdentity(value) {
 return value?.endsWith(suffix) ? value.slice(0, -suffix.length) : value;
}
