"use strict";
(function (root, factory) {
  if (typeof module === "object" && module.exports)
    module.exports = factory(require("./core.js"), require("./company.js"));
  else root.BillingBackup = factory(root.BillingCore, root.BillingCompany);
})(globalThis, function (Core, Company) {
  const { validate, clone, migrateLedger, mergeBackup } = Core;
  const { normalizeCompany } = Company;
  function createWorkspaceBackup(state, settings) {
    const ledger = migrateLedger(state, settings);
    delete ledger.company;
    return {
      format: "local-billing-workspace",
      version: 3,
      exportedAt: new Date().toISOString(),
      ledger,
      company: normalizeCompany(settings),
    };
  }
  function decodeWorkspaceBackup(input) {
    if (input?.format === "local-billing-workspace") {
      if (![2, 3].includes(input.version))
        throw Error("Unsupported backup version");
      validate(input.ledger);
      if (input.version === 3 && input.ledger.docs.some((d) => !d.issuer))
        throw Error("Missing historical issuer snapshot");
      return {
        ledger: clone(input.ledger),
        company: normalizeCompany(input.company),
        legacy: input.version < 3,
      };
    }
    validate(input);
    return {
      ledger: clone(input),
      company: input.company ? normalizeCompany(input.company) : null,
      legacy: true,
    };
  }
  function planWorkspaceRestore(current, decoded, restoreCompany) {
    const original = normalizeCompany(current.company);
    const incoming = migrateLedger(
      { ...decoded.ledger, company: decoded.company || original },
      original,
    );
    const result = mergeBackup(migrateLedger(current, original), incoming);
    result.next.company =
      restoreCompany && decoded.company
        ? normalizeCompany(decoded.company)
        : original;
    result.companyChanged =
      JSON.stringify(original) !== JSON.stringify(result.next.company);
    result.legacyBaselines = decoded.ledger.docs.filter(
      (d) => !d.issuer,
    ).length;
    validate(result.next);
    return result;
  }
  return { createWorkspaceBackup, decodeWorkspaceBackup, planWorkspaceRestore };
});
