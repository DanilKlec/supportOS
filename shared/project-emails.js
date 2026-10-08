// The first available array is authoritative, including when intentionally empty.
export function emailAddresses(record) {
 const source=Array.isArray(record.addresses)?record.addresses:Array.isArray(record.emails)?record.emails:
  [['supportEmail','Support'],['kycEmail','KYC'],['vipEmail','VIP']]
   .filter(([key])=>record[key])
   .map(([key,type])=>({id:`${record.id}:${key}`,type,email:record[key]}));
 return source.map((row,index)=>({...row,order:Number.isInteger(row.order)&&row.order>=0?row.order:index}))
  .sort((a,b)=>a.order-b.order);
}
export function normalizeProjectEmail(record) {
 const addresses=emailAddresses(record).map((row,order)=>({...row,order}));
 const first=type=>addresses.find(row=>row.type.toLowerCase()===type)?.email||'';
 return {...record,addresses,emails:addresses.map(({order,...row})=>row),supportEmail:first('support'),kycEmail:first('kyc'),vipEmail:first('vip')};
}
export function projectEmailText(record) {
 return [record.projectName,'',...emailAddresses(record).map(row=>`${row.type}: ${row.email}`)].join('\n');
}
export function mergeEmailImport(existing,incoming) {
 if(!existing)return normalizeProjectEmail(incoming);
 const imported=emailAddresses(incoming);
 const used=new Set();
 const addresses=emailAddresses(existing).map(old=>{
  const index=imported.findIndex((row,i)=>!used.has(i)&&row.type.toLowerCase()===old.type.toLowerCase());
  if(index<0)return old;
  used.add(index);
  return {...old,...imported[index],id:old.id,note:imported[index].note??old.note};
 });
 imported.forEach((row,index)=>{if(!used.has(index))addresses.push(row);});
 return normalizeProjectEmail({...existing,...incoming,id:existing.id,addresses:addresses.map((row,order)=>({...row,order}))});
}
