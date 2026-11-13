'use strict';
const assetPromises=new Map(),assetUrls=new Map();
function asset(name){
 if(name==='engine'&&window.Tesseract||window.bwPDFAssets?.[name])return Promise.resolve();
 if(!assetPromises.has(name))assetPromises.set(name,new Promise((ok,no)=>{const script=document.createElement('script');script.src='pdf-assets/'+name+'.js';script.onload=ok;script.onerror=()=>{assetPromises.delete(name);no(Error('PDF engine unavailable'))};document.head.append(script)}));return assetPromises.get(name)
}
function bytes(name){return Uint8Array.from(atob(bwPDFAssets[name]),c=>c.charCodeAt(0))}
function assetUrl(name){if(!assetUrls.has(name))assetUrls.set(name,URL.createObjectURL(new Blob([bytes(name)],{type:'text/javascript'})));return assetUrls.get(name)}
const cleanLine=s=>s.trim().replace(/[|!]+$/,'').trim();
function extractFields(raw){
 const lines=raw.split('\n').map(cleanLine).filter(Boolean),txt=lines.join('\n');
 const name=lines.map(s=>s.replace(/\s+/g,'').match(/([\u3400-\u9fff（）()·]{2,60}(?:有限公司|有限責任公司))/)?.[1]).filter(Boolean).map(s=>s.replace(/^.*(?:公司名稱|業務名稱|客戶名稱|客戶資料|法團名稱)/,''))[0]||'';
 const en=lines.map(s=>s.replace(/^.*?\b(?:Corporation|Company Name|Business Name)\s*[:：]?\s*/i,'').match(/\b([A-Z0-9][A-Z0-9&().,' -]{1,100}\s(?:LIMITED|LTD\.?))\b/i)?.[1]).find(Boolean)||'';
 const br=txt.match(/\b(\d{8})\s*[-–]\s*\d{3}\s*[-–]\s*\d{2}/)?.[1]||txt.match(/(?:BRN|BR No\.?|商業登記號碼|Business Registration (?:Number|No\.?))\s*[:：]?\s*(\d{8})\b/i)?.[1]||'';
 const start=lines.findIndex(s=>/^(?:(?:address|地址)\s*[:：]?\s*)?(?:FLAT|ROOM|RM\b|UNIT\b|SUITE|\d+\s*\/F)/i.test(s));
 let address='';if(start>=0){const parts=[];for(const s of lines.slice(start,start+5)){if(/nature of business|法律地位|業務性質|BODY CORPORATE|Certificate No/i.test(s))break;parts.push(s.replace(/^(address|地址)\s*[:：]?\s*/i,''));if(/\b(?:HONG KONG|HK|KOWLOON|N\.T\.)\s*$/i.test(s))break}address=parts.join(', ')}
 return {name,en,br,address};
}
async function recognizeCustomer(file,status,active){
 const check=()=>{if(!active())throw Error('cancelled')};
 if(!/\.pdf$/i.test(file.name)){
  const url=URL.createObjectURL(file);
  try{
   const img=new Image();img.src=url;await img.decode();check();
   const scale=Math.min(1,2600/Math.max(img.naturalWidth,img.naturalHeight));
   const canvas=document.createElement('canvas');
   canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));
   canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
   const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
   status(wording('正在识别图片文字…','正在辨識圖片文字…','Reading text from the image…'));
   return await readCanvas(canvas,'',check)
  }finally{URL.revokeObjectURL(url)}
 }
 await Promise.all(['pdf','pdfworker'].map(asset));check();
 const pdfjs=await import(assetUrl('pdf'));pdfjs.GlobalWorkerOptions.workerSrc=assetUrl('pdfworker');
 const pdf=await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false,useSystemFonts:true}).promise;
 try{
 const first=await pdf.getPage(1);let raw='';
 for(let i=1;i<=Math.min(3,pdf.numPages);i++){check();const pg=i===1?first:await pdf.getPage(i),content=await pg.getTextContent();let prev;for(const v of content.items){if(!v.str)continue;const y=v.transform[5];raw+=(prev!==undefined&&Math.abs(prev-y)>3?'\n':' ')+v.str+(v.hasEOL?'\n':'');prev=y}raw+='\n'}
 const text=extractFields(raw);if(text.name&&text.en&&text.br&&text.address)return text;
 status(wording('正在识别首页扫描图像…','正在辨識首頁掃描圖像…','Reading the scanned first page…'));
 const unit=first.getViewport({scale:1}),vp=first.getViewport({scale:2100/Math.max(unit.height,unit.width)}),canvas=document.createElement('canvas');
 canvas.width=Math.ceil(vp.width);canvas.height=Math.ceil(vp.height);await first.render({canvasContext:canvas.getContext('2d'),viewport:vp}).promise;
 return await readCanvas(canvas,raw,check)
 }finally{await pdf.destroy()}
}
async function readCanvas(canvas,raw,check){
 await Promise.all(['engine','worker','core','en','zh'].map(asset));check();
 const text=extractFields(raw);let worker;
 try{
 worker=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error("OCR setup timed out")),90000);Tesseract.createWorker([{code:'chi_tra',data:bytes('zh')},{code:'eng',data:bytes('en')}],1,{workerPath:assetUrl('worker'),workerBlobURL:false,corePath:assetUrl('core')+'#core.js',cacheMethod:'none',errorHandler:err=>{clearTimeout(timer);reject(Error(String(err)))}}).then(w=>{clearTimeout(timer);resolve(w)},err=>{clearTimeout(timer);reject(err)})});
 check();await worker.setParameters({tessedit_pageseg_mode:'6'});
 const readRect=async rect=>{check();const result=await worker.recognize(canvas,rect?{rectangle:{left:Math.floor(rect[0]*canvas.width),top:Math.floor(rect[1]*canvas.height),width:Math.floor(rect[2]*canvas.width),height:Math.floor(rect[3]*canvas.height)}}:{});return result.data.text};
 const full=await readRect();const ocr=extractFields(full);
 if(/BUSINESS REGISTRATION|商業登記|商業登記證/i.test(raw+' '+full)&&Math.abs(canvas.width/canvas.height-.707)<.06){
 const names=extractFields(await readRect([.20,.168,.52,.038])),addr=extractFields(await readRect([.20,.254,.49,.069])),cert=extractFields(await readRect([.327,.405,.31,.026]));
 if(names.en||names.name){if(names.en)ocr.en=names.en;if(names.name)ocr.name=names.name;if(addr.address)ocr.address=addr.address;if(cert.br)ocr.br=cert.br}
 }
 return Object.fromEntries(Object.keys(text).map(k=>[k,ocr[k]||text[k]]))
 }finally{if(worker)await worker.terminate()}
}
function directoryImport(){
 return '<div class="importzone" id="importzone"><strong>'+wording('将客户商证或截图拖到这里','將客戶商證或截圖拖到這裡','Drop a registration document or screenshot here')+'</strong><small>PDF / JPG / PNG / WebP · ≤ 50 MB · '+wording('在本机识别，核对后保存','在本機辨識，核對後儲存','Processed locally. Review before saving.')+'</small><button id="pickpdf">'+wording('选择文件','選擇檔案','Choose file')+'</button><input type="file" accept="application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp" id="pdfinput" hidden></div>'
}
function sameClient(s,v){const en=x=>(x||'').trim().toUpperCase().replace(/[\s.,]/g,''),br=(v.br||'').trim();return s.clients.find(c=>br&&br===c.br.trim()||(!br||!c.br)&&((en(v.en)&&en(v.en)===en(c.en))||(en(v.name)&&en(v.name)===en(c.name))))}
async function importFile(file){
 if(!file)return;
 if(!/\.(pdf|jpe?g|png|webp)$/i.test(file.name)){alert(wording('支持 PDF、JPG、PNG 和 WebP。','支援 PDF、JPG、PNG 和 WebP。','Choose a PDF, JPG, PNG or WebP file.'));return}
 if(file.size>50*1024*1024){alert(wording('单个文件最大 50 MB。','單個檔案最大 50 MB。','The file limit is 50 MB.'));return}
 const title=wording('核对客户资料','核對客戶資料','Review customer details');
 modal(title,'<p id="pdfprogress" role="status"></p>');const prog=$('pdfprogress'),active=()=>prog.isConnected&&$('dlg').open,report=s=>{if(active())prog.textContent=s};
 report(wording('正在读取文件…','正在讀取檔案…','Reading file…'));
 let v={name:'',en:'',br:'',address:''},error=false;
 try{v=await recognizeCustomer(file,report,active)}catch{error=true}if(!active())return;
 const match=sameClient(data,v);const msg=match?wording('名册已有此客户，请核对当前登记资料。','名冊已有此客戶，請核對現有登記資料。','This customer is already in the directory. Review the existing record.'):error?wording('识别未完成，请核对原件并补填。加密 PDF 请先解锁。','辨識未完成，請核對原件並補填。加密 PDF 請先解鎖。','Could not finish reading. Complete the fields manually, or unlock a protected PDF.'):wording('请对照原件核对名称、登记号码及地址。','請對照原件核對名稱、登記號碼及地址。','Check names, registration number and address against the original.');
 const inp=(l,k)=>field(l,k,(k==='name'?'required ':'')+'value="'+esc(v[k])+'"');
 form(title,'<p>'+esc(file.name)+'</p><p role="status">'+esc(msg)+'</p>'+inp(legalNameLabel(),'name')+inp('英文名稱','en')+inp('商業登記號碼','br')+inp('地址','address'),match?wording('核对并更新客户','核對並更新客戶','Review and update customer'):'儲存客戶',(values,next)=>{
 for(const k of Object.keys(values))values[k]=values[k].trim();if(!values.name)return;
 const duplicate=sameClient(read(),values);
 if(duplicate&&!confirm(wording('名册已有 ','名冊已有 ','Existing customer: ')+duplicate.name+wording('。将用本次核对的非空字段更新该客户，继续吗？','。將以本次核對的非空欄位更新，繼續嗎？','. Update this record with the reviewed non-empty fields?')))return;
 const id=duplicate?.id||crypto.randomUUID();
 if(update(s=>{if(duplicate){const target=s.clients.find(c=>c.id===duplicate.id);if(!target)throw Error('Customer record changed');Object.assign(target,Object.fromEntries(Object.entries(values).filter(([,x])=>x)))}else{if(sameClient(s,values))throw Error('Duplicate customer');s.clients.push({...values,id})}})){$('dlg').close();if(next==='invoice')newPI(id)}
 });invoiceNextButton()
}
document.addEventListener('click',e=>{if(e.target.id==='pickpdf')$('pdfinput').click()});
document.addEventListener('change',e=>{if(e.target.id==='pdfinput'){const f=e.target.files[0];e.target.value='';importFile(f)}});
for(const event of ['dragover','dragleave','drop'])document.addEventListener(event,e=>{const z=e.target.closest?.('#importzone');if(!z)return;e.preventDefault();z.classList.toggle('over',event==='dragover');if(event==='drop')importFile(e.dataTransfer.files[0])});
