'use strict';
// The backup format keeps the ledger and company settings together. No network requests.
function createWorkspaceBackup(state,settings){
 validate(state);
 const ledger=JSON.parse(JSON.stringify(state));delete ledger.company;
 return {format:'local-billing-workspace',version:2,exportedAt:new Date().toISOString(),ledger,company:normalizeCompany(settings)};
}
function decodeWorkspaceBackup(input){
 if(input?.format==='local-billing-workspace'){
  if(input.version!==2)throw Error('Unsupported backup version');
  validate(input.ledger);
  return {ledger:JSON.parse(JSON.stringify(input.ledger)),company:normalizeCompany(input.company),legacy:false};
 }
 validate(input);
 return {ledger:JSON.parse(JSON.stringify(input)),company:input.company?normalizeCompany(input.company):null,legacy:true};
}
function planWorkspaceRestore(current,decoded,restoreCompany){
 const result=mergeBackup(current,decoded.ledger);
 const original=normalizeCompany(current.company||company);
 result.next.company=restoreCompany&&decoded.company?normalizeCompany(decoded.company):original;
 result.companyChanged=JSON.stringify(original)!==JSON.stringify(result.next.company);
 validate(result.next);
 return result;
}
