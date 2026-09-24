// The JSON document remains in the existing versioned content store.
// Legacy columns are retained for older readers; emails is authoritative once present.
export function emailAddresses(record) {
 if (Array.isArray(record.emails)) return record.emails;
 return [['supportEmail','Support'],['kycEmail','KYC'],['vipEmail','VIP']]
  .filter(([key])=>record[key])
  .map(([key,type])=>({id:`${record.id}:${key}`,type,email:record[key]}));
}
export function normalizeProjectEmail(record) {
 const emails=emailAddresses(record).map(row=>({...row}));
 const first=type=>emails.find(row=>row.type.toLowerCase()===type)?.email||'';
 return {...record,emails,supportEmail:first('support'),kycEmail:first('kyc'),vipEmail:first('vip')};
}
export function projectEmailText(record) {
 return [record.projectName,'',...emailAddresses(record).map(row=>`${row.type}: ${row.email}`)].join('\n');
}
export function mergeEmailImport(existing,incoming) {
 if(!existing)return normalizeProjectEmail(incoming);
 const rows=emailAddresses(incoming);
 const types=new Set(rows.map(row=>row.type.toLowerCase()));
 return normalizeProjectEmail({...existing,...incoming,id:existing.id,emails:[
  ...emailAddresses(existing).filter(row=>!types.has(row.type.toLowerCase())),
  ...rows.map(row=>{const old=emailAddresses(existing).find(v=>v.type.toLowerCase()===row.type.toLowerCase());return {...old,...row,id:old?.id||row.id,note:row.note??old?.note};}),
 ]});
}
