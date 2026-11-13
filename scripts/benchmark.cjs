'use strict';
const fs=require('node:fs'),path=require('node:path'),{performance}=require('node:perf_hooks');
const {api,fixture}=require('../tests/core.cjs');
const company=api.normalizeCompany({nameTc:'基准测试公司（虚构）',nameEn:'FICTIONAL BENCHMARK COMPANY'});
const ledger={v:1,company,clients:fixture.clients,docs:Array.from({length:100},(_,i)=>({...fixture.docs[0],id:'benchmark-'+i,pi:'PI-2026-'+String(i+1).padStart(3,'0'),contract:'DEMO-BENCH-'+i,amount:10000+i}))};
const samples=[];let serialized='';
for(let i=0;i<550;i++){
 const start=performance.now();const backup=api.createWorkspaceBackup(ledger,company);serialized=JSON.stringify(backup);
 const decoded=api.decodeWorkspaceBackup(JSON.parse(serialized));const result=api.planWorkspaceRestore({v:1,clients:[],docs:[],company},decoded,true);
 if(result.next.docs.length!==100)throw Error('Incomplete recovery');
 if(i>=50)samples.push(performance.now()-start);
}
samples.sort((a,b)=>a-b);
const out={date:'2026-11-13',environment:{node:process.version,platform:process.platform},scenario:'Create, serialise, parse, validate and restore a 100-record fictional workspace in memory',records:100,warmup_iterations:50,measured_iterations:samples.length,backup_bytes:Buffer.byteLength(serialized),median_ms:Number(samples[250].toFixed(3)),p95_ms:Number(samples[475].toFixed(3)),limits:'Single runtime, synthetic data, in-memory functions only. Excludes localStorage, user input, UI, OCR and PDF. No manual-work baseline or real-user efficiency claim.'};
const target=path.resolve(__dirname,'../docs/results/backup-benchmark.json');fs.writeFileSync(target,JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify(out,null,2));
