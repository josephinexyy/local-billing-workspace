'use strict';
const phrases=`金額|金额|Amount
開票工作台|开票工作台|Billing workspace
＋ 建立形式發票|＋ 新建业务|＋ New business
單據總覽|业务总览|Business overview
客戶名冊|客户名册|Customers
備份與匯出|备份与导出|Backup & export
待收預付款 · HKD|待收预付款 · HKD|Awaiting payment · HKD
已確認收款 · HKD|已确认收款 · HKD|Payments received · HKD
已開正式發票|已开正式发票|Invoices issued
單據明細|业务列表|Business list
搜尋|搜索|Search
搜尋客戶或單號|搜索客户、合同或单号|Search customer or reference
全部|全部|All statuses
待收款|待收款|Awaiting payment
已收款|已收款|Paid
已取消|已取消|Cancelled
客戶／單據編號|客户／服务项目|Customer / service
開立日期|开立日期|Issue date
金額 HKD|金额 HKD|Amount HKD
狀態|状态|Status
查看|查看|View
新增客戶|新增客户|Add customer
＋ 新增客戶|＋ 新增客户|＋ Add customer
下載完整備份|下载完整备份|Download backup
匯出交易 CSV|导出交易 CSV|Export transactions (CSV)
還原備份|还原备份|Restore backup
完整備份包含客戶、交易及單據編號。CSV 可交給會計核對。|完整备份包含客户、交易及单据编号。CSV 可交给会计核对。|Backups contain customers, transactions and document numbers. Use CSV for reconciliation.
資料儲存在此瀏覽器。更換裝置或清除瀏覽器資料前，請先匯出備份。|数据保存在此浏览器。更换设备或清除浏览器数据前，请先导出备份。|Records are saved in this browser. Export a backup before changing devices or clearing browser data.
沒有符合條件的單據|没有符合条件的单据|No matching documents
公司名稱|公司名称|Registered name
英文名稱|英文名称|English name
商業登記號碼|商业登记号码|Business registration no.
地址|地址|Address
儲存客戶|保存客户|Save customer
建立形式發票|新建形式发票|New pro forma invoice
客戶|客户|Customer
合約編號|合同编号|Contract no.
服務項目（繁體中文）|服务项目（繁体中文）|Service description (Traditional Chinese)
服務項目（英文）|服务项目（英文）|Service description (English)
金額（HKD）|金额（HKD）|Amount (HKD)
形式發票日期|形式发票日期|Pro forma date
建立單據|建立单据|Create document
單據詳情|单据详情|Document details
形式發票|形式发票|Pro forma
正式發票|正式发票|Invoice
收據|收据|Receipt
列印／儲存 PDF|打印／保存 PDF|Print / Save PDF
確認全額到賬並開票|确认全额到账并开票|Record payment & issue invoice
取消單據|取消单据|Cancel document
確認全額到賬|确认全额到账|Confirm payment in full
銀行實際入賬日|银行实际入账日|Bank credit date
開票日期|开票日期|Invoice date
銀行交易參考（選填）|银行交易参考（选填）|Bank reference (optional)
確認到賬並開票|确认到账并开票|Confirm & issue
開票日期須為入賬當日或之後|开票日期须为入账当日或之后|Invoice date must be on or after the payment date.
此單據已處理|此单据已处理|This document has already been processed.
取消此形式發票並保留紀錄？|取消此形式发票并保留记录？|Cancel this pro forma and retain its record?
備份格式不符|备份格式不符|Invalid backup format
客戶資料不完整|客户资料不完整|Incomplete customer details
單據資料不完整|单据资料不完整|Incomplete document details
編號重複|编号重复|Duplicate number
介面語言|界面语言|Interface language
單據語言|单据语言|Document language
下載離線版|下载离线版|Download offline app
關閉|关闭|Close
補填英文名稱及項目|补填英文名称及项目|Complete English details
缺少英文資料|缺少英文资料|English details required
儲存|保存|Save
請先補齊英文客戶名稱及服務項目。|请先补齐英文客户名称及服务项目。|Enter the English customer name and service description before printing.
交易資料需另外備份。|交易数据需另外备份。|Back up transaction data separately.`;
const dict=new Map(phrases.split('\n').map(x=>{const [k,z,e]=x.split('|');return[k,[k,z,e]]}));
for(const [key,label] of [['單據總覽','業務總覽'],['單據明細','業務列表'],['客戶／單據編號','客戶／服務項目'],['＋ 建立形式發票','＋ 新增業務']])dict.get(key)[0]=label;
const pref=(k,vals,f)=>{let x=localStorage.getItem('local-billing-'+k);return vals.includes(x)?x:f};
let ui=pref('ui',['tc','sc','en'],'sc'),outputLang=pref('output',['tc','en'],'tc');
function tr(x){const i=['tc','sc','en'].indexOf(ui);return dict.get(x)?.[i]??x}
function localize(el){if(!el)return;const w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let n;while(n=w.nextNode()){if(n.parentElement.closest('.doc,script,style,[data-native]'))continue;const v=n.textContent.trim();if(dict.has(v))n.textContent=n.textContent.replace(v,tr(v));else if(/^\d+ 張$/.test(v))n.textContent=v.replace(' 張',ui==='en'?'':ui==='sc'?' 张':' 張');}
for(const e of el.querySelectorAll('[placeholder],[aria-label]'))for(const a of ['placeholder','aria-label'])if(e.hasAttribute(a))e.setAttribute(a,tr(e.getAttribute(a)))}
const defaultItem='市場推廣顧問服務費（全額預付款）',defaultEnglish='Marketing consultancy services (full advance payment)';
