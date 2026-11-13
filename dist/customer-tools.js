let convertDisplay;
function displayName(c){
 if(ui==='en')return c.en||c.name;
 if(ui==='sc'){convertDisplay??=OpenCC.Converter({from:'hk',to:'cn'});return convertDisplay(c.name)}
 return c.name
}
function legalNameLabel(){return wording('客户登记名称（照商证原文，将印在中文单据上）','客戶登記名稱（照商證原文，將印在中文單據上）','Registered name as on certificate (Chinese documents)')}
function invoiceNextButton(){const b=document.createElement('button');b.type='submit';b.dataset.next='invoice';b.textContent=wording('保存并开票','儲存並開票','Save & create pro forma');$('form').append(' ',b)}
async function documentPdf(d,k){
 const shell=document.createElement('div');shell.style.cssText='position:absolute;left:-10000px;top:0;width:710px;background:white';shell.innerHTML=paper(d,k);document.body.append(shell);
 try{
 await document.fonts.load('14px InvoiceHK');await document.fonts.ready;
 const canvas=await html2canvas(shell,{scale:2,backgroundColor:'#ffffff',logging:false,windowWidth:1200});
 const pdf=await PDFLib.PDFDocument.create(),img=await pdf.embedPng(canvas.toDataURL('image/png')),page=pdf.addPage([595.28,841.89]);
 const scale=Math.min(520/img.width,767/img.height);page.drawImage(img,{x:37.5,y:805-img.height*scale,width:img.width*scale,height:img.height*scale});
 return await pdf.save();
 }finally{shell.remove()}
}
async function makePair(d){
 const zipFiles={},en=outputLang==='en',safe=x=>x.replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').slice(0,90);
 const customer=safe(en?d.customer.en:d.customer.name);
 for(const k of ['inv','rc']){
 zipFiles[customer+'_'+safe(d[k])+'.pdf']=await documentPdf(d,k);
 }
 return fflate.zipSync(zipFiles,{level:0})
}
async function exportPair(d,b){
 if(!d.inv||!d.rc||needsEnglish(d)||b.disabled)return;
 b.disabled=true;const text=b.textContent;b.textContent=wording('正在生成 PDF…','正在產生 PDF…','Generating PDFs…');
 try{const bytes=await makePair(d);download((outputLang==='en'?d.customer.en:d.customer.name).replace(/[<>:"/\\|?*]/g,'_')+'_'+d.inv+'.zip',bytes,'application/zip')}
 catch(error){alert(wording('导出失败，请重试。','匯出失敗，請重試。','Export failed. Please retry.'))}
 finally{b.disabled=false;b.textContent=text}
}

async function prepareDocumentDownload(d,k,slot){
 if(!slot)return;
 try{
  const bytes=await documentPdf(d,k);
  if(!slot.isConnected)return;
  const file=new File([bytes],d[k].replace(/[^A-Za-z0-9_.-]/g,'_')+'.pdf',{type:'application/pdf'});
  const url=URL.createObjectURL(file);
  const link=document.createElement('a');
  link.className='pdf-download';link.href=url;link.download=file.name;
  link.textContent=wording('下载 PDF','下載 PDF','Download PDF');
  const feedback=document.createElement('small');feedback.setAttribute('role','status');
  const preview=document.createElement('a');preview.className='pdf-preview';
  preview.href=url;preview.target='_blank';preview.rel='noopener';
  preview.textContent=wording('预览','預覽','Preview');
  slot.replaceChildren(link,preview,feedback);
  const cleanup=new MutationObserver(()=>{if(!slot.isConnected){URL.revokeObjectURL(url);cleanup.disconnect()}});
  cleanup.observe(document.body,{childList:true,subtree:true})
 }catch(err){
  if(slot.isConnected)slot.textContent=wording('PDF 生成失败，请用打印保存。','PDF 產生失敗，請用列印儲存。','PDF generation failed. Use Print to save.')
 }
}
