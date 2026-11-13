"use strict";
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.BillingCompany = factory();
})(globalThis, function () {
  const billingDefaults = Object.freeze({
    nameTc: "示例公司（演示）",
    nameEn: "EXAMPLE COMPANY · DEMO",
    registration: "DEMO-ONLY",
    address: "Example address — replace in Company settings",
    contactName: "Example contact",
    phone: "",
    email: "demo@example.invalid",
    accountName: "Example company",
    bankName: "Example bank",
    bankAccount: "",
    swift: "",
    signatoryTc: "示例簽署人",
    signatoryEn: "Example signatory",
    contractPrefix: "DEMO",
    timeZone: "Asia/Hong_Kong",
    paymentTermsTc: "付款條款依雙方約定，請在正式使用前修改。",
    paymentTermsEn:
      "Payment terms as agreed. Update before using for business.",
  });
  function normalizeCompany(value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw Error("Invalid company settings");
    const result = { ...billingDefaults };
    for (const k of Object.keys(result)) {
      if (value[k] !== undefined) {
        if (typeof value[k] !== "string" || value[k].length > 300)
          throw Error("Invalid setting: " + k);
        result[k] = value[k].trim();
      }
    }
    if (!result.nameTc && !result.nameEn)
      throw Error("Enter at least one company name");
    if (!/^[A-Za-z0-9]{1,12}$/.test(result.contractPrefix))
      throw Error("Contract prefix: use 1–12 letters or numbers");
    try {
      new Intl.DateTimeFormat("en", { timeZone: result.timeZone }).format();
    } catch {
      throw Error("Enter a valid time zone, e.g. Asia/Hong_Kong");
    }
    return result;
  }

  return { billingDefaults, normalizeCompany };
});
