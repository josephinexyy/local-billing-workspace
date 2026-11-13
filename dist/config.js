"use strict";
const { billingDefaults, normalizeCompany } = BillingCompany;
const demoMode =
  typeof location !== "undefined" &&
  /(?:^|[?&])demo=1(?:&|$)/.test(location.search);
const billingLedgerStorageKey = demoMode
  ? "local-billing-demo-ledger-v1"
  : "local-billing-ledger-v1";
const companyStorageKey = demoMode
  ? "local-billing-demo-company-v1"
  : "local-billing-company-v1";
function loadCompany() {
  try {
    const state = JSON.parse(
      localStorage.getItem(billingLedgerStorageKey) || "null",
    );
    if (state?.company) return normalizeCompany(state.company);
  } catch {}
  try {
    return normalizeCompany(
      JSON.parse(
        localStorage.getItem(companyStorageKey) ||
          JSON.stringify(demoMode ? billingDemoData.company : {}),
      ),
    );
  } catch {
    return { ...billingDefaults };
  }
}
let company = loadCompany();
