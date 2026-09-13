// Only a short, generic topic. Never pass customer messages or identifiers here.
export function safeKnowledgeTopic(value) {
 if(typeof value!=='string'||value.length>120)return null;
 const topic=value.normalize('NFKC').trim().replace(/\s+/g,' ');
 if(topic.length<3||topic.split(' ').length>8||! /^[\p{L} -]+$/u.test(topic))return null;
 if(/password|парол|token|токен|secret|секрет|credential|логин|login|http|www|email|e-mail|почт|телефон|phone|карт|card|account|аккаунт|сч[её]т|паспорт/i.test(topic))return null;
 return topic.toLowerCase();
}
