'use strict';
const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),money=n=>(n/100).toLocaleString('en-HK',{minimumFractionDigits:2,maximumFractionDigits:2}),day=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:company.timeZone}).format(new Date()), key='local-billing-ledger-v1';
const seed={v:1,clients:[],docs:[]};
const currencyOf=d=>d.currency===undefined?"HKD":d.currency;
const amountDue=d=>currencyOf(d)+" "+money(d.amount);
let storageError='';
function read(){try{const s=JSON.parse(localStorage.getItem(key)||JSON.stringify(seed));delete s.retiredPI;validate(s);storageError='';return s}catch(e){storageError=e.message;return {v:1,clients:[],docs:[]}}}

let data=read(),tab='單據總覽',query='',filter='全部',selected,kind;
function update(fn){try{const next=read();if(storageError)throw Error('本機資料無法讀取，已停止寫入。請先下載原始資料備份。');fn(next);validate(next);localStorage.setItem(key,JSON.stringify(next));data=next;draw();return true}catch(e){alert(tr(e.message));return false}}
function validate(s){if(s.v!==1||!Array.isArray(s.clients)||!Array.isArray(s.docs))throw Error('備份格式不符');if(s.retiredPI!==undefined&&(!Array.isArray(s.retiredPI)||!s.retiredPI.every(n=>typeof n==='string'&&n.trim())))throw Error('備份格式不符');const unique=a=>new Set(a).size===a.length;const str=x=>typeof x==='string'&&x.trim();const dt=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&!Number.isNaN(Date.parse(x))&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x;for(const c of [...s.clients,...s.docs.map(d=>d.customer)])if(!c||!str(c.id)||!str(c.name)||!['en','br','address'].every(k=>typeof c[k]==='string'))throw Error('客戶資料不完整');for(const d of s.docs)if(!["HKD","USD"].includes(currencyOf(d))||!str(d.id)||!str(d.pi)||!str(d.item)||typeof d.contract!=='string'||!dt(d.date)||!Number.isSafeInteger(d.amount)||d.amount<=0||!['待收款','已收款','已取消'].includes(d.status)||(d.status==='已收款'&&(!str(d.inv)||!str(d.rc)||!dt(d.paid)||!dt(d.issued)||d.issued<d.paid)))throw Error('單據資料不完整');for(const a of [s.clients.map(c=>c.id),s.docs.map(d=>d.id),s.docs.flatMap(d=>[d.pi,d.inv,d.rc].filter(Boolean)).concat(s.retiredPI||[])])if(!unique(a))throw Error('編號重複')}
function canDelete(d){return d?.status==='已取消'&&!d.inv&&!d.rc&&!d.paid&&!d.issued}
function removeCancelled(s,id){
 const index=s.docs.findIndex(d=>d.id===id);
 if(!canDelete(s.docs[index]))throw Error('此單據已處理');
 s.docs.splice(index,1);
}
function deleteButton(d){return canDelete(d)?btn(wording('删除','刪除','Delete'),'delete-pi',d.id):''}
function seq(s,p,y){
 const prefix=p+'-'+y+'-';
 const field={PI:'pi',INV:'inv',RC:'rc'}[p];
 const used=new Set(s.docs.map(d=>d[field]).filter(id=>typeof id==='string'&&id.startsWith(prefix)&&/^\d+$/.test(id.slice(prefix.length))).map(id=>Number(id.slice(prefix.length))));
 let n=1;
 if(p==='PI'){while(used.has(n))n++}
 else{for(const issued of used)n=Math.max(n,issued+1)}
 return prefix+String(n).padStart(3,'0')
}
const btn=(label,action,id='')=>'<button data-act="'+action+'" data-id="'+esc(id)+'">'+label+'</button>';function modal(title,html){$('dt').textContent=title;$('body').innerHTML=html;localize($('dlg'));if(!$('dlg').open)$('dlg').showModal()}
function balanceSummary(docs){
 const paid=docs.filter(d=>d.status==='已收款'),pending=docs.filter(d=>d.status==='待收款');
 const sum=(records,code)=>money(records.reduce((n,d)=>n+(currencyOf(d)===code?d.amount:0),0));
 const body=['HKD','USD'].map(code=>{
  const name=code==='HKD'?wording('港币','港幣','Hong Kong dollar'):wording('美元','美元','US dollar');
  return '<tr><th scope="row"><b>'+code+'</b><small>'+name+'</small></th><td>'+sum(pending,code)+'</td><td>'+sum(paid,code)+'</td></tr>'
 }).join('');
 return '<header class="balance-head"><h2>'+wording('收款概览','收款概覽','Payment overview')+'</h2><small>'+tr('已開正式發票')+' · '+paid.length+'</small></header><table><thead><tr><th>'+wording('币种','幣種','Currency')+'</th><th>'+tr('待收款')+'</th><th>'+tr('已收款')+'</th></tr></thead><tbody>'+body+'</tbody></table>'
}
function draw(){$('stats').innerHTML=balanceSummary(data.docs);$('tabs').innerHTML=['單據總覽','客戶名冊','備份與匯出'].map(t=>'<button data-tab="'+t+'" class="'+(t===tab?'active':'')+'">'+t+'</button>').join('');
if(tab==='單據總覽'){$('list').innerHTML='<div class="row tools"><b class="grow">單據明細</b><input id="search" aria-label="搜尋" placeholder="搜尋客戶或單號" value="'+esc(query)+'"><select id="filter">'+['全部','待收款','已收款','已取消'].map(f=>'<option value="'+f+'" '+(f===filter?'selected':'')+'>'+tr(f)+'</option>').join('')+'</select></div><div class="scroll"><table><thead><tr><th>客戶／單據編號</th><th>開立日期</th><th class="money">金額</th><th>狀態</th><th></th></tr></thead><tbody id="rows"></tbody></table></div>';rows();$('search').oninput=e=>{query=e.target.value;rows()};$('filter').onchange=e=>{filter=e.target.value;rows()}}
if(tab==='客戶名冊')$('list').innerHTML='<div class="row"><h2 class="grow">客戶名冊</h2>'+btn('＋ 新增客戶','client')+'</div>'+directoryImport()+data.clients.map(c=>'<p><b>'+esc(displayName(c))+'</b>　'+esc(c.en)+'<br><small>'+esc(c.address)+ ' · BR '+esc(c.br)+'</small>　'+btn(wording('开票','開票','Create pro forma'),'client-invoice',c.id)+'</p>').join('');
if(tab==='備份與匯出')$('list').innerHTML='<h2>備份與匯出</h2><p>完整備份包含客戶、交易及單據編號。CSV 可交給會計核對。</p><div class="row">'+btn('下載完整備份','backup')+btn('匯出交易 CSV','csv')+btn(wording('导入数据包／合并备份','匯入資料包／合併備份','Import / merge backup'),'restore')+(localStorage.getItem(key+'-before-import')?btn(wording('下载导入前备份','下載匯入前備份','Download pre-import backup'),'pre-import-backup'):'')+'</div>'+(document.documentElement.hasAttribute('data-offline')||location.protocol==='file:'?'':'<div class="offlinebox"><a href="Billing-Workspace.html" download="Billing-Workspace.html">'+tr('下載離線版')+'</a><small>'+({sc:'仅下载程序。迁移已有单据，请另存完整备份。',tc:'只下載程式。轉移現有單據時，請另存完整備份。',en:'Downloads the app only. Export a full backup to transfer existing records.'})[ui]+'</small></div>');if(storageError)$('list').innerHTML='<h2>本機資料讀取失敗</h2><p>已停止寫入，原始資料仍保留。請下載原始資料交由修復。</p>'+btn('下載原始資料','raw-backup');localize($('list'));localize($('stats'));localize($('tabs'))}
function rows(){const ds=data.docs.filter(d=>(filter==='全部'||d.status===filter)&&[d.customer.name,displayName(d.customer),d.customer.en,d.pi,d.inv,d.rc,d.contract].join(' ').toLowerCase().includes(query.toLowerCase())).reverse();$('rows').innerHTML=ds.map(d=>'<tr><td><b>'+esc(displayName(d.customer))+'</b><br><small>'+esc(ui==='en'?(enItem(d)||d.item):d.item)+'</small></td><td>'+esc(d.date)+'</td><td class="money">'+amountDue(d)+'</td><td><span class="badge '+(d.inv?'paid':'')+'">'+d.status+'</span></td><td>'+btn(wording('查看业务','查看業務','View business'),'view',d.id)+'</td></tr>').join('')||'<tr><td colspan="5">沒有符合條件的單據</td></tr>';localize($('rows'))}
const field=(t,n,opts='required')=>'<label>'+t+'<input name="'+n+'" '+opts+'></label>';function form(title,fields,submit,fn){modal(title,'<form id="form">'+fields+'<button class="primary">'+submit+'</button></form>');$('form').onsubmit=e=>{e.preventDefault();fn(Object.fromEntries(new FormData(e.target)),e.submitter?.dataset.next)}}
function addclient(after,done){form('新增客戶',field(legalNameLabel(),'name')+field('英文名稱','en','')+field('商業登記號碼','br','')+field('地址','address',''),'儲存客戶',(v,next)=>{const id=crypto.randomUUID();if(update(s=>s.clients.push({...v,id}))){$('dlg').close();if(done)done(id);else if(after||next==='invoice')newPI(id)}});if(!done&&!after)invoiceNextButton()}
const wording=(sc,tc,en)=>({sc,tc,en})[ui];
const services=[
 [defaultItem,defaultEnglish,'市场推广顾问服务费（全额预付款）'],
 ['市場調研服務費','Market research services','市场调研服务费'],
 ['競爭分析服務費','Competitive analysis services','竞争分析服务费'],
 ['品牌策劃服務費','Brand strategy services','品牌策划服务费'],
 ['產品顧問服務費','Product consultancy services','产品顾问服务费'],
 ['網站設計服務費','Website design services','网站设计服务费'],
 ['Shopify 獨立站規劃服務費','Shopify store planning services','Shopify 独立站规划服务费'],
 ['內容製作服務費','Content production services','内容制作服务费']
];
function serviceList(s){
 const list=services.map(v=>[...v]);
 for(const d of [...s.docs].reverse()){
  const eng=enItem(d),match=list.find(v=>v[0]===d.item&&v[1]===eng);
  if(!match&&d.item&&eng)list.push([d.item,eng,d.item]);
 }
 return list;
}
function contractNumber(s,c,date){
 const initials=(c.en||'').toUpperCase().match(/[A-Z0-9]+/g)||[];
 const code=initials.find(x=>!['LIMITED','LTD','THE'].includes(x))?.slice(0,10)||String(c.br||c.id).replace(/[^A-Za-z0-9]/g,'').slice(0,8).toUpperCase()||'CLIENT';
 const base=company.contractPrefix+'-'+code+'-'+date.replaceAll('-','');
 const used=new Set(s.docs.map(d=>d.contract));let id=base;
 for(let i=2;used.has(id);i++)id=base+'-'+String(i).padStart(2,'0');
 return id;
}
function newPI(cid,draft={}){
 if(!data.clients.length)return addclient(true);
 const opts=serviceList(data),custom=wording('自定义项目','自訂項目','Custom service');
 const label=(t,html)=>'<label>'+t+html+'</label>';
 const options=(a)=>a.map(([id,text])=>'<option value="'+esc(id)+'">'+esc(text)+'</option>').join('');
 form('建立形式發票','<div class="pigrid">'+label(tr('客戶'),'<select name="customer">'+options(data.clients.map(c=>[c.id,displayName(c)]))+'</select>')+field('形式發票日期','date','type="date" required')+'</div><button type="button" id="pi-add">'+tr('新增客戶')+'</button>'+
 label(tr('合約編號'),'<select name="mode"></select>')+'<input aria-label="'+tr('合約編號')+'" name="contract" required>'+
 '<hr class="pidiv">'+label(wording('选择服务项目','選擇服務項目','Choose a service'),'<select name="service">'+options(opts.map((v,i)=>[String(i),ui==='en'?v[1]:ui==='sc'?v[2]:v[0]]).concat([['custom',custom]]))+'</select>')+
 field('服務項目（繁體中文）','item')+field('服務項目（英文）','itemEn','')+
 '<button type="button" id="suggest">'+wording('生成英文','產生英文','Suggest English')+'</button><small id="translation-note" role="status"></small>'+
 '<div class="pigrid">'+label(wording('结算币种','結算幣種','Settlement currency'),'<select name="currency">'+options([['HKD',wording('港币','港幣','Hong Kong dollar')+' (HKD)'],['USD',wording('美元','美元','US dollar')+' (USD)']])+'</select>')+field('金額','amount' ,'type="number" required min="0.01" max="999999999" step="0.01"')+'</div><small>'+wording('确认开立时分配形式发票编号。','確認開立時分配形式發票編號。','A pro forma number is assigned when you issue it.')+'</small>',wording('确认开立形式发票','確認開立形式發票','Issue pro forma invoice'),v=>{
 const id=crypto.randomUUID();
 if(!v.item.trim()||!v.contract.trim())return;
 if(update(s=>{const c=s.clients.find(c=>c.id===v.customer);if(!c)throw Error(tr('客戶資料不完整'));
 const contract=v.mode==='auto'?contractNumber(s,c,v.date):v.contract.trim();
 s.docs.push({id,pi:seq(s,'PI',v.date.slice(0,4)),customer:{...c},contract,item:v.item.trim(),itemEn:v.itemEn.trim(),date:v.date,currency:v.currency,amount:Math.round(Number(v.amount)*100),status:'待收款'})}))view(id,'pi')
 });
 const f=$('form'),e=f.elements, note=$('translation-note');
 e.customer.value=cid||draft.customer||data.clients[0].id;e.date.value=draft.date||day();
 const current=()=>data.clients.find(c=>c.id===e.customer.value);
 function setContract(){const mode=e.mode.value;e.contract.readOnly=mode!=='manual';e.contract.value=mode==='auto'?(e.date.value?contractNumber(data,current(),e.date.value):''):mode==='manual'?'':mode.slice(4)}
 function modes(){const old=[...new Set(data.docs.filter(d=>d.customer.id===e.customer.value&&d.contract).map(d=>d.contract))];
 e.mode.innerHTML=options([['auto',wording('新合同 · 自动编号','新合約 · 自動編號','New contract · automatic number')],...old.map(x=>['old:'+x,wording('沿用 ','沿用 ','Reuse ')+x]),['manual',wording('输入其他已签合同号','輸入其他已簽合約號','Enter existing contract number')]]);setContract()}
 function useService(){const v=opts[e.service.value];e.namedItem('item').value=v?v[0]:'';e.itemEn.value=v?v[1]:'';note.textContent=''}
 modes();useService();e.mode.onchange=setContract;e.date.onchange=()=>{if(e.mode.value==='auto')setContract()};e.customer.onchange=modes;e.service.onchange=useService;
 if(draft.item!==undefined){e.service.value=draft.service;e.namedItem('item').value=draft.item;e.itemEn.value=draft.itemEn;e.amount.value=draft.amount;e.currency.value=draft.currency||"HKD"}
 $('pi-add').onclick=()=>{const saved=Object.fromEntries(new FormData(f));addclient(false,id=>newPI(id,saved))};
 const known=()=>opts.find(v=>[v[0],v[2]].some(s=>s.trim()===e.namedItem('item').value.trim()));
 e.namedItem('item').oninput=()=>{e.service.value='custom';const v=known();e.itemEn.value=v?v[1]:'';note.textContent=''};
 $('suggest').onclick=async()=>{
 const source=e.namedItem('item').value.trim(),prior=e.itemEn.value;if(!source)return e.namedItem('item').focus();
 const v=known();if(v){e.itemEn.value=v[1];return}
 const prompt=wording('此浏览器无法翻译这项内容。可填一次英文，开单后下次直接选用。','此瀏覽器無法翻譯這項內容。可填一次英文，開單後下次直接選用。','Translation is unavailable here. Enter English once and reuse it after saving.');
 let translator;try{
 if(!globalThis.Translator)throw Error();const config={sourceLanguage:'zh',targetLanguage:'en'};
 if(await Translator.availability(config)==='unavailable')throw Error();
 note.textContent=wording('正在准备浏览器翻译…','正在準備瀏覽器翻譯…','Preparing browser translation…');
 translator=await Translator.create(config);const result=await translator.translate(source);
 if(f.isConnected&&e.namedItem('item').value.trim()===source&&e.itemEn.value===prior){e.itemEn.value=result;note.textContent=wording('请核对英文后开单。','請核對英文後開單。','Review the suggested translation before issuing.')}
 }catch{note.textContent=prompt}finally{translator?.destroy?.()}
 };
}
function languagePicker(){return '<label class="docselect"><span>'+tr('單據語言')+'</span><select id="doclang" data-native><option value="tc" '+(outputLang==='tc'?'selected':'')+'>繁體中文（English）</option><option value="en" '+(outputLang==='en'?'selected':'')+'>English</option></select></label>'}
function enItem(d){return d.itemEn||(d.item===defaultItem?defaultEnglish:'')}
function needsEnglish(d){return outputLang==='en'&&(!enItem(d)||!d.customer.en)}
function editEnglish(d){form('補填英文名稱及項目',field('英文名稱','name','required value="'+esc(d.customer.en)+'"')+field('服務項目（英文）','item','required value="'+esc(enItem(d))+'"'),'儲存',v=>{if(!v.name.trim()||!v.item.trim())return;if(update(s=>{const x=s.docs.find(x=>x.id===d.id);x.itemEn=v.item.trim();x.customer.en=v.name.trim()}))view(d.id,kind)})}
function paper(d,k){
const en=outputLang==='en',pi=k==='pi',rc=k==='rc',t=(z,e)=>en?e:z+'（'+e+'）';
if(needsEnglish(d))return '<p>'+tr('請先補齊英文客戶名稱及服務項目。')+'</p>';
const pair=(z,e,v)=>'<div><span class="caption">'+t(z,e)+'</span>'+esc(v)+'</div>',line=(z,e,v)=>'<div>'+t(z,e)+'　'+esc(v)+'</div>',amount=amountDue(d);
return '<article class="doc" lang="'+(en?'en':'zh-HK')+'"><div class="mast">'+(en?'':'<b>'+esc(company.nameTc)+'</b><br>')+'<strong>'+esc(company.nameEn)+'</strong><br><small>'+t('商業登記號碼','BR No.')+' '+esc(company.registration)+'<br>'+esc(company.address)+'<br>'+esc([company.contactName,company.phone,company.email].filter(Boolean).join(' · '))+'</small></div><h2>'+ (pi?t('形式發票','Pro Forma Invoice'):rc?t('收據','Receipt'):t('發票','Invoice'))+'</h2><div class="meta">'+pair('單據編號','Document No.',d[k])+pair('開立日期','Issue Date',pi?d.date:d.issued)+(d.contract?pair('合約編號','Contract No.',d.contract):'')+(pi?'':pair('形式發票編號','Pro Forma No.',d.pi))+(rc?pair('發票編號','Invoice No.',d.inv):'')+'</div><hr><div class="block">'+pair(rc?'付款人':'客戶',rc?'Received from':'Bill to',(en?'':d.customer.name+'　')+d.customer.en)+esc(d.customer.address)+(d.customer.br?line('商業登記號碼','BR No.',d.customer.br):'')+'</div><table><tr><th>'+t('服務項目','Description')+'</th><th>'+t('數量','Qty')+'</th><th class="money">'+t('金額','Amount')+'</th></tr><tr><td>'+esc(en?enItem(d):d.item)+(en||!enItem(d)?'':'<br><small>'+esc(enItem(d))+'</small>')+'</td><td>1</td><td class="money">'+amount+'</td></tr></table><p class="total">'+(pi?t('應付總額','Amount Due'):rc?t('實收金額','Amount Received'):t('發票總額','Invoice Total'))+'　'+amount+'</p>'+(pi?'<p>'+esc(en?company.paymentTermsEn:company.paymentTermsTc)+'</p><div class="bank">'+line('收款戶名','Account Name',company.accountName)+line('收款銀行','Bank',company.bankName)+line('賬戶號碼','Account No.',company.bankAccount)+line('銀行識別碼','SWIFT',company.swift)+line('付款幣種','Payment Currency',currencyOf(d))+line('匯款附言','Reference',d.pi)+'</div>':line('收款日期','Payment Date',d.paid)+line('已收金額','Amount Paid',amount)+line('尚欠金額','Balance',currencyOf(d)+' 0.00')+(d.ref?line('銀行交易參考','Bank Reference',d.ref):'')+'<p class="sign">'+t('授權簽署','Authorised Signature')+'　____________________<br>'+esc(en?company.signatoryEn:company.signatoryTc)+'</p>')+(d.status==='已取消'?'<strong>'+t('已取消','Cancelled')+'</strong>':'')+'</article>'}
function recordActions(d){
 const payment='';
 const danger=d.status==='已取消'?deleteButton(d):btn('取消單據','cancel');
 if(!payment&&!danger)return '';
 return '<details class="record-actions"><summary>'+wording('取消／删除业务','取消／刪除業務','Cancel / delete business')+'</summary><section>'+payment+danger+'</section></details>'
}
function businessOverview(d){
 const isPaid=d.status==='已收款',cancelled=d.status==='已取消';
 const msg=cancelled?wording('这笔业务已取消，相关单据保留供查阅。','這筆業務已取消，相關單據保留供查閱。','This business is cancelled. Documents remain available for reference.'):isPaid?wording('已确认收款，发票和收据已归档在这笔业务下。','已確認收款，發票和收據已歸檔在這筆業務下。','Payment confirmed. The invoice and receipt are filed under this business.'):wording('已开付款通知。收到款项后，在下方确认到账。','已開付款通知。收到款項後，在下方確認到賬。','Payment request issued. Confirm payment below after funds arrive.');
 const file=(label,explain,k)=>'<button class="business-file" data-act="'+k+'"><strong>'+label+'</strong><small>'+explain+'</small><span>→</span></button>';
 const pair=(label,value)=>'<div><dt>'+label+'</dt><dd>'+esc(value||'—')+'</dd></div>';
 return '<section class="business-summary"><div><span class="badge">'+tr(d.status)+'</span><h2>'+esc(displayName(d.customer))+'</h2><p>'+esc(ui==='en'?(enItem(d)||d.item):d.item)+'</p></div><strong class="business-amount">'+amountDue(d)+'</strong></section><p class="business-message">'+msg+'</p><div class="business-files">'+file(wording('付款通知','付款通知','Payment request'),wording('形式发票 · 付款前使用','形式發票 · 付款前使用','Pro forma invoice · before payment'),'pi')+(d.inv?file(wording('正式发票','正式發票','Invoice'),wording('交易与费用明细','交易與費用明細','Transaction and charge details'),'inv')+file(wording('收据','收據','Receipt'),wording('款项已收到的凭证','款項已收到的憑證','Acknowledgement of payment'),'rc'):'')+'</div>'+(!d.inv?'<p class="business-note">'+wording('确认到账后，正式发票和收据会自动出现在这里。','確認到賬後，正式發票和收據會自動出現在這裡。','The invoice and receipt appear here after payment confirmation.')+'</p>':'')+'<div class="business-next">'+(d.status==='待收款'?btn(wording('确认收到款项','確認收到款項','Confirm payment received'),'pay'):isPaid?btn(wording('下载发票及收据','下載發票及收據','Download invoice & receipt'),'pair'):'')+'</div><details class="business-refs"><summary>'+wording('编号与日期（查询时展开）','編號與日期（查詢時展開）','References and dates')+'</summary><dl>'+pair(wording('合同编号','合約編號','Contract reference'),d.contract)+pair(wording('形式发票','形式發票','Pro forma'),d.pi)+pair(wording('正式发票','正式發票','Invoice'),d.inv)+pair(wording('收据','收據','Receipt'),d.rc)+pair(wording('业务建立日期','業務建立日期','Business date'),d.date)+pair(wording('实际到账日期','實際到賬日期','Payment date'),d.paid)+'</dl><small>'+wording('这里只关联合同编号，尚未保存合同正文。','這裡只關聯合約編號，尚未儲存合約正文。','Only the contract reference is stored here, not the contract file.')+'</small></details>'+recordActions(d);
}
function view(id,k){const d=data.docs.find(d=>d.id===id);if(!d)return;selected=id;kind=k||'overview';
 if(kind==='overview'){modal(wording('业务详情','業務詳情','Business details'),businessOverview(d));return}
 if(!['pi','inv','rc'].includes(kind)||!d[kind])return view(id);
 modal(wording('业务单据','業務單據','Business document'),'<div class="row">'+btn(wording('← 返回业务','← 返回業務','← Back to business'),'view',id)+btn('形式發票','pi')+(d.inv?btn('正式發票','inv')+btn('收據','rc'):'')+'</div>'+languagePicker()+paper(d,kind)+'<div class="document-toolbar">'+(needsEnglish(d)?btn('補填英文名稱及項目','translate'):'<span id="pdf-download-slot" role="status">'+wording('正在准备 PDF…','正在準備 PDF…','Preparing PDF…')+'</span>'+btn(wording('打印','列印','Print'),'print')+(d.inv?btn(wording('下载发票及收据','下載發票及收據','Download invoice & receipt'),'pair'):''))+'</div>');prepareDocumentDownload(d,kind,$('pdf-download-slot'))}

function pay(d){form('確認全額到賬','<p>'+ (ui==='en'?'Confirm the bank credit before recording ':ui==='sc'?'请核对银行入账记录，本次确认金额 ':'請核對銀行入賬紀錄，本次確認金額 ')+amountDue(d)+'</p>'+field('銀行實際入賬日','paid','type="date" required max="'+day()+'" value="'+day()+'"')+field('開票日期','issued','type="date" required max="'+day()+'" value="'+day()+'"')+field('銀行交易參考（選填）','ref',''),'確認到賬並開票',v=>{if(v.issued<v.paid)return alert(tr('開票日期須為入賬當日或之後'));if(update(s=>{const x=s.docs.find(x=>x.id===d.id);if(x.status!=='待收款')throw Error('此單據已處理');const y=v.issued.slice(0,4);Object.assign(x,v,{inv:seq(s,'INV',y),rc:seq(s,'RC',y),status:'已收款'})}))view(d.id)})}
function download(name,txt,type){const a=document.createElement('a'),url=URL.createObjectURL(new Blob([txt],{type}));a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.tab){tab=b.dataset.tab;draw();return}const a=b.dataset.act,d=data.docs.find(x=>x.id===selected);if(a==='client-invoice')newPI(b.dataset.id);if(a==='pair')exportPair(d,b);if(a==='view')view(b.dataset.id);if(['pi','inv','rc'].includes(a))view(selected,a);if(a==='pay')pay(d);if(a==='translate')editEnglish(d);if(a==='print'){if(needsEnglish(d))return;$('paper').innerHTML=paper(d,kind);$('dlg').close();window.print();view(selected,kind)}if(a==='client'||a==='client-new'){e.preventDefault();addclient(a==='client-new')}
if(a==='cancel'){
 const doc=b.dataset.id?data.docs.find(x=>x.id===b.dataset.id):d;if(!doc||doc.status==='已取消')return;
 selected=doc.id;const action=wording('确认取消','確認取消','Confirm cancellation');
 modal(tr('取消單據'),'<p>'+esc(doc.pi)+' · '+amountDue(doc)+'</p><p>'+wording('取消后会保留编号和原始记录。','取消後會保留編號和原始紀錄。','The original record and its number will be retained.')+(doc.inv?wording(' 发票和收据也将标记为已取消。实际退款请另行处理。',' 發票和收據也將標記為已取消。實際退款請另行處理。',' The invoice and receipt will also be marked cancelled. Handle any refund separately.'):'')+'</p>'+btn(action,'void-confirm',doc.id)+btn(wording('返回','返回','Back'),'view',doc.id));
}
if(a==='delete-pi'){
 const doc=data.docs.find(x=>x.id===b.dataset.id);
 if(!canDelete(doc))return;
 const title=wording('删除形式发票','刪除形式發票','Delete pro forma invoice');
 modal(title,'<p>'+esc(doc.customer.name)+'<br>'+esc(doc.pi)+' · '+amountDue(doc)+'</p><p>'+wording('请确认这张错单尚未发给客户。删除后将释放形式发票编号，供同年新单使用。','請確認這張錯單尚未發給客戶。刪除後將釋放形式發票編號，供同年新單使用。','Check that this pro forma was never sent to the customer. Deleting it releases its annual sequence number.')+'</p>'+btn(wording('确认删除','確認刪除','Confirm deletion'),'delete-confirm',doc.id)+btn(wording('返回','返回','Back'),'view',doc.id))
}
if(a==='delete-confirm'){
 if(update(s=>removeCancelled(s,b.dataset.id))){selected=undefined;$('dlg').close()}
}
if(a==='void-confirm'&&d&&d.id===b.dataset.id){
 if(update(s=>{const x=s.docs.find(x=>x.id===d.id);if(!x||x.status!==d.status||x.status==='已取消')throw Error('此單據已處理');x.status='已取消'}))view(d.id,'pi')
}
if(a==='backup')download('Billing-backup-'+day()+'.json',JSON.stringify(read(),null,2),'application/json');if(a==='csv'){const cell=x=>'"'+String(x??'').replace(/^[=+@-]/,"'$&").replaceAll('"','""')+'"';download('Billing-transactions.csv','\ufeff'+[['客戶','合約','形式發票','正式發票','收據','開票日','收款日','幣種','金額','狀態'],...data.docs.map(x=>[x.customer.name,x.contract,x.pi,x.inv,x.rc,x.issued||x.date,x.paid,currencyOf(x),x.amount/100,x.status])].map(r=>r.map(cell).join(',')).join('\r\n'),'text/csv')}if(a==='restore')chooseImport();if(a==='import-confirm')commitImport();if(a==='raw-backup')download('Billing-original-data.json',localStorage.getItem(key)||'{}','application/json');if(a==='pre-import-backup')download('Billing-before-import.json',localStorage.getItem(key+'-before-import')||'{}','application/json');});
$('settings').onclick=openCompanySettings;$('newpi').onclick=()=>newPI();$('close').onclick=()=>$('dlg').close();window.addEventListener('storage',()=>{data=read();$('dlg').close();draw()});function applyLanguage(){document.querySelector('.company-name').textContent=company.nameTc;document.querySelector('.company-en').textContent=company.nameEn;$('settings').textContent=wording('公司设置','公司設定','Company settings');document.documentElement.lang={tc:'zh-HK',sc:'zh-CN',en:'en'}[ui];document.title=tr('開票工作台')+' · Local Billing';$('uilabel').textContent=tr('介面語言');for(const b of $('ui').querySelectorAll('button'))b.setAttribute('aria-pressed',String(b.dataset.ui===ui));document.querySelector('h1').textContent=tr('開票工作台');$('newpi').textContent=tr('＋ 建立形式發票');document.querySelector('footer').textContent=tr('資料儲存在此瀏覽器。更換裝置或清除瀏覽器資料前，請先匯出備份。');$('close').setAttribute('aria-label',tr('關閉'));draw()}
$('ui').onclick=e=>{if(!e.target.dataset.ui)return;ui=e.target.dataset.ui;localStorage.setItem('local-billing-ui',ui);applyLanguage()};
document.addEventListener('change',e=>{if(e.target.id==='doclang'){outputLang=e.target.value;localStorage.setItem('local-billing-output',outputLang);view(selected,kind)}});

let pendingImport;
function mergeBackup(current,incoming){
 validate(current);validate(incoming);
 const next=JSON.parse(JSON.stringify(current));let added=0,skipped=0;
 const normal=c=>c.br.trim()?('br:'+c.br.replace(/\D/g,'')):('name:'+c.name.trim()+'|'+c.en.trim().toUpperCase());
 const clientMap=new Map();
 for(const c of incoming.clients){
  const same=next.clients.find(x=>normal(x)===normal(c));
  if(same){clientMap.set(c.id,same.id);continue}
  if(next.clients.some(x=>x.id===c.id))throw Error('客戶識別碼衝突：'+c.name);
  next.clients.push({...c});clientMap.set(c.id,c.id);
 }
 for(const d of incoming.docs){
  const old=next.docs.find(x=>x.pi===d.pi||x.id===d.id);
  if(old){
   const same=old.pi===d.pi&&old.contract===d.contract&&old.date===d.date&&old.amount===d.amount&&currencyOf(old)===currencyOf(d)&&normal(old.customer)===normal(d.customer)&&old.item===d.item&&(old.itemEn||enItem(old))===(d.itemEn||enItem(d));
   if(!same)throw Error('同號資料不一致，未匯入：'+d.pi);
   if(d.status!=='待收款'&&(d.status!==old.status||d.inv!==old.inv||d.rc!==old.rc||d.paid!==old.paid||d.issued!==old.issued))throw Error('收款或作廢狀態衝突，未匯入：'+d.pi);
   skipped++;continue;
  }
  const copy=JSON.parse(JSON.stringify(d));copy.customer.id=clientMap.get(d.customer.id)||d.customer.id;
  next.docs.push(copy);added++;
 }
 validate(next);return {next,added,skipped};
}
function chooseImport(){
 const f=document.createElement('input');f.type='file';f.accept='.json,application/json';f.hidden=true;document.body.appendChild(f);f.addEventListener('cancel',()=>f.remove(),{once:true});
 f.onchange=async()=>{if(!f.files[0])return;try{
  const incoming=JSON.parse(await f.files[0].text());const current=read();if(storageError)throw Error(storageError);
  const result=mergeBackup(current,incoming);pendingImport=incoming;
  modal(wording('核对导入数据','核對匯入資料','Review import'),'<p>'+wording('保留已有记录；新增 ','保留已有紀錄；新增 ','Keep existing records; add ')+result.added+wording(' 笔，跳过重复 ',' 筆，略過重複 ',' records; skip ')+result.skipped+'</p><div class="scroll"><table><thead><tr><th>客戶 / Customer</th><th>PI</th><th>金額 / Amount</th></tr></thead><tbody>'+incoming.docs.map(d=>'<tr><td>'+esc(d.customer.name)+'</td><td>'+esc(d.pi)+'</td><td>'+amountDue(d)+'</td></tr>').join('')+'</tbody></table></div><p>'+wording('导入不会确认到账或生成新票号。导入前账本会自动保留在本机。','匯入不會確認到賬或產生新票號。匯入前帳本會自動保留於本機。','Import does not confirm payment or issue new numbers. A pre-import snapshot is saved locally.')+'</p>'+btn(wording('确认合并导入','確認合併匯入','Confirm merge'),'import-confirm'));
 }catch(e){pendingImport=null;alert(tr(e.message))}finally{f.remove()}};f.click();
}
function commitImport(){
 if(!pendingImport)return;
 try{const current=read();if(storageError)throw Error(storageError);const result=mergeBackup(current,pendingImport);
 if(result.added===0){pendingImport=null;$('dlg').close();draw();return}
 localStorage.setItem(key+'-before-import',JSON.stringify(current));
 localStorage.setItem(key,JSON.stringify(result.next));data=result.next;pendingImport=null;$('dlg').close();tab='單據總覽';filter='全部';query='';draw();
 }catch(e){alert(tr(e.message))}
}

function openCompanySettings(){
 const specs=[
  ['中文公司名称','中文公司名稱','Company name (Chinese)','nameTc'],
  ['英文公司名称','英文公司名稱','Company name (English)','nameEn'],
  ['登记号码','登記號碼','Registration no.','registration'],
  ['公司地址','公司地址','Company address','address'],
  ['联系人','聯絡人','Contact name','contactName'],
  ['电话','電話','Phone','phone'],['电邮','電郵','Email','email'],
  ['收款户名','收款戶名','Account name','accountName'],
  ['银行名称','銀行名稱','Bank name','bankName'],
  ['收款账号','收款帳號','Account no.','bankAccount'],['SWIFT','SWIFT','SWIFT','swift'],
  ['中文签署人','中文簽署人','Signatory (Chinese)','signatoryTc'],
  ['英文签署人','英文簽署人','Signatory (English)','signatoryEn'],
  ['合同编号前缀','合約編號前綴','Contract prefix','contractPrefix'],
  ['时区','時區','Time zone','timeZone'],
  ['中文付款条款','中文付款條款','Payment terms (Chinese)','paymentTermsTc'],
  ['英文付款条款','英文付款條款','Payment terms (English)','paymentTermsEn']
 ];
 form(wording('公司设置','公司設定','Company settings'),'<p>'+wording('仅保存在当前浏览器；不会写回公开代码。更换设备时需另行保存这些设置。','只儲存在目前瀏覽器；不會寫回公開程式碼。更換裝置時需另行保存這些設定。','Saved in this browser only, not in the public source. Keep these settings separately when changing devices.')+'</p>'+specs.map(([sc,tc,en,k])=>field(wording(sc,tc,en),k,'maxlength="300" value="'+esc(company[k])+'"')).join(''),wording('保存设置','儲存設定','Save settings'),v=>{
 try{const next=normalizeCompany(v);localStorage.setItem(companyStorageKey,JSON.stringify(next));company=next;$('dlg').close();applyLanguage()}catch(e){alert(e.message)}
 });
}

applyLanguage();
