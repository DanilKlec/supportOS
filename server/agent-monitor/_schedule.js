export function validateSchedule(body) {
 const invalid=()=>{throw Object.assign(new Error('Некорректный график. Проверьте месяц, сотрудников и смены.'),{status:400});};
 if (!body || !/^20\d{2}-(0[1-9]|1[0-2])$/.test(body.month ?? '') || !Array.isArray(body.people) || !body.people.length || body.people.length>500 || !Array.isArray(body.records) || body.records.length>46500) invalid();
 if(body.people.some(email=>typeof email!=='string'||email.length>320||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) invalid();
 const people=body.people.map(email=>email.toLowerCase());
 if(new Set(people).size!==people.length) invalid();
 const keys=new Set();
 const records=body.records.map(row=>{
  if(!row || typeof row.day!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(row.day)||!row.day.startsWith(`${body.month}-`)||Number.isNaN(Date.parse(row.day))||new Date(row.day).toISOString().slice(0,10)!==row.day||typeof row.email!=='string'||!people.includes(row.email.toLowerCase())||!['day','evening','night'].includes(row.shift)) invalid();
  const email=row.email.toLowerCase();const key=`${row.day}:${email}:${row.shift}`;
  if(keys.has(key)) invalid();keys.add(key);
  return {day:row.day,email,shift:row.shift};
 });
 return {month:body.month,people,records};
}
