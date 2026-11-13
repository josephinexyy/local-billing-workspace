'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),dist=path.join(root,'dist');
const html=fs.readFileSync(path.join(dist,'index.html'),'utf8');
const refs=[...html.matchAll(/<script src="([^"]+)"/g)].map(x=>x[1]);
for(const ref of refs){const file=path.join(dist,ref);if(!fs.existsSync(file))throw Error('Missing script: '+ref);cp.execFileSync(process.execPath,['--check',file],{stdio:'inherit'})}
for(const name of ['demo-backup.json','demo-workspace-backup.json'])JSON.parse(fs.readFileSync(path.join(root,'examples',name),'utf8'));
if(!fs.existsSync(path.join(dist,'vendor/invoice-hk.woff')))throw Error('Missing invoice font');
for(const name of ['core','en','engine','pdf','pdfworker','worker','zh'])if(!fs.existsSync(path.join(dist,'pdf-assets',name+'.js')))throw Error('Missing OCR/PDF asset: '+name);
console.log('Script references, JavaScript syntax, sample JSON, font and OCR assets checked.');
