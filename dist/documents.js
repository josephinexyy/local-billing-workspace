"use strict";
(function (root, factory) {
  if (typeof module === "object" && module.exports)
    module.exports = factory(require("./core.js"));
  else root.BillingDocuments = factory(root.BillingCore);
})(globalThis, function (Core) {
  const { amountDue, currencyOf } = Core;
  const esc = (v) =>
    String(v ?? "").replace(
      /[&<>\"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '\"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  function renderDocument(
    d,
    k,
    { language = "tc", defaultItem = "", defaultEnglish = "" } = {},
  ) {
    Core.validateIssuer(d.issuer);
    const company = d.issuer.company;
    const outputLang = language;
    const enItem = (d) =>
      d.itemEn || (d.item === defaultItem ? defaultEnglish : "");
    const en = outputLang === "en",
      pi = k === "pi",
      rc = k === "rc",
      t = (z, e) => (en ? e : z + "（" + e + "）");
    if (outputLang === "en" && (!enItem(d) || !d.customer.en))
      throw Error("Complete the English customer name and service description");
    const pair = (z, e, v) =>
        '<div><span class="caption">' + t(z, e) + "</span>" + esc(v) + "</div>",
      line = (z, e, v) => "<div>" + t(z, e) + "　" + esc(v) + "</div>",
      amount = amountDue(d);
    return (
      '<article class="doc" lang="' +
      (en ? "en" : "zh-HK") +
      '"><div class="mast">' +
      (en ? "" : "<b>" + esc(company.nameTc) + "</b><br>") +
      "<strong>" +
      esc(company.nameEn) +
      "</strong><br><small>" +
      t("商業登記號碼", "BR No.") +
      " " +
      esc(company.registration) +
      "<br>" +
      esc(company.address) +
      "<br>" +
      esc(
        [company.contactName, company.phone, company.email]
          .filter(Boolean)
          .join(" · "),
      ) +
      "</small></div><h2>" +
      (pi
        ? t("形式發票", "Pro Forma Invoice")
        : rc
          ? t("收據", "Receipt")
          : t("發票", "Invoice")) +
      '</h2><div class="meta">' +
      pair("單據編號", "Document No.", d[k]) +
      pair("開立日期", "Issue Date", pi ? d.date : d.issued) +
      (d.contract ? pair("合約編號", "Contract No.", d.contract) : "") +
      (pi ? "" : pair("形式發票編號", "Pro Forma No.", d.pi)) +
      (rc ? pair("發票編號", "Invoice No.", d.inv) : "") +
      '</div><hr><div class="block">' +
      pair(
        rc ? "付款人" : "客戶",
        rc ? "Received from" : "Bill to",
        (en ? "" : d.customer.name + "　") + d.customer.en,
      ) +
      esc(d.customer.address) +
      (d.customer.br ? line("商業登記號碼", "BR No.", d.customer.br) : "") +
      "</div><table><tr><th>" +
      t("服務項目", "Description") +
      "</th><th>" +
      t("數量", "Qty") +
      '</th><th class="money">' +
      t("金額", "Amount") +
      "</th></tr><tr><td>" +
      esc(en ? enItem(d) : d.item) +
      (en || !enItem(d) ? "" : "<br><small>" + esc(enItem(d)) + "</small>") +
      '</td><td>1</td><td class="money">' +
      amount +
      '</td></tr></table><p class="total">' +
      (pi
        ? t("應付總額", "Amount Due")
        : rc
          ? t("實收金額", "Amount Received")
          : t("發票總額", "Invoice Total")) +
      "　" +
      amount +
      "</p>" +
      (pi
        ? "<p>" +
          esc(en ? company.paymentTermsEn : company.paymentTermsTc) +
          '</p><div class="bank">' +
          line("收款戶名", "Account Name", company.accountName) +
          line("收款銀行", "Bank", company.bankName) +
          line("賬戶號碼", "Account No.", company.bankAccount) +
          line("銀行識別碼", "SWIFT", company.swift) +
          line("付款幣種", "Payment Currency", currencyOf(d)) +
          line("匯款附言", "Reference", d.pi) +
          "</div>"
        : line("收款日期", "Payment Date", d.paid) +
          line("已收金額", "Amount Paid", amount) +
          line("尚欠金額", "Balance", currencyOf(d) + " 0.00") +
          (d.ref ? line("銀行交易參考", "Bank Reference", d.ref) : "") +
          '<p class="sign">' +
          t("授權簽署", "Authorised Signature") +
          "　____________________<br>" +
          esc(en ? company.signatoryEn : company.signatoryTc) +
          "</p>") +
      (d.status === "已取消"
        ? "<strong>" + t("已取消", "Cancelled") + "</strong>"
        : "") +
      "</article>"
    );
  }

  // Pick page boundaries in raster coordinates without cutting through a text line.
  function pageSlices(height, capacity, lines = []) {
    if (
      !Number.isSafeInteger(height) ||
      height <= 0 ||
      !Number.isSafeInteger(capacity) ||
      capacity <= 0
    )
      throw Error("Invalid page dimensions");
    const pages = [];
    let start = 0;
    while (start < height) {
      let end = Math.min(height, start + capacity);
      if (end < height) {
        let changed = true;
        while (changed) {
          changed = false;
          for (const [top, bottom] of lines) {
            if (top < end && bottom > end) {
              end = Math.floor(top);
              changed = true;
            }
          }
        }
      }
      if (end <= start)
        throw Error("A document line is taller than one PDF page");
      pages.push([start, end]);
      start = end;
    }
    return pages;
  }
  return { esc, renderDocument, pageSlices };
});
