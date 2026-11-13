"use strict";
(function (root, factory) {
  if (typeof module === "object" && module.exports)
    module.exports = factory(
      require("./core.js"),
      require("./backup.js"),
      require("./company.js"),
    );
  else
    root.BillingStorage = factory(
      root.BillingCore,
      root.BillingBackup,
      root.BillingCompany,
    );
})(globalThis, function (Core, Backup, Company) {
  function createStore({ storage, key, seed, fallbackCompany, locks }) {
    const clone = Core.clone;
    function read() {
      const raw = storage.getItem(key);
      return Core.migrateLedger(
        raw === null ? clone(seed) : JSON.parse(raw),
        fallbackCompany(),
      );
    }
    async function transaction(change, { beforeImport = false } = {}) {
      if (!locks?.request)
        throw Error(
          "This browser cannot safely coordinate writes. Use a current browser at http://localhost, or export a backup.",
        );
      return locks.request("billing-write:" + key, () => {
        const raw = storage.getItem(key),
          current = read(),
          next = clone(current);
        const result = change(next);
        if (result && typeof result.then === "function")
          throw Error("Storage changes must be synchronous");
        Core.validate(next);
        for (const old of current.docs) {
          const updated = next.docs.find((d) => d.id === old.id);
          if (
            updated &&
            JSON.stringify(old.issuer) !== JSON.stringify(updated.issuer)
          )
            throw Error("Issued company snapshots cannot be changed");
        }
        const normalized = JSON.stringify(next);
        if (raw !== normalized) {
          // Keep the original pre-upgrade bytes before the first snapshot migration.
          if (
            raw &&
            JSON.parse(raw).docs.some((d) => !d.issuer) &&
            !storage.getItem(key + "-before-snapshots")
          )
            storage.setItem(key + "-before-snapshots", raw);
          if (beforeImport)
            storage.setItem(
              key + "-before-import",
              JSON.stringify(
                Backup.createWorkspaceBackup(current, current.company),
              ),
            );
          storage.setItem(key, normalized);
        }
        return { state: next, result };
      });
    }
    async function reset() {
      if (!locks?.request)
        throw Error("A browser with Web Locks support is required");
      return locks.request("billing-write:" + key, () => {
        storage.removeItem(key);
        storage.removeItem(key + "-before-import");
        storage.removeItem(key + "-before-snapshots");
        return read();
      });
    }
    return { read, transaction, reset };
  }
  return { createStore };
});
