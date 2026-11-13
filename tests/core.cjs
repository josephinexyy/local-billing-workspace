"use strict";
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path");
const { api, fixture: demo } = require("./helpers.cjs");
const {
  clone,
  validate,
  mergeBackup,
  seq,
  normalizeCompany,
  createWorkspaceBackup,
  decodeWorkspaceBackup,
  planWorkspaceRestore,
  renderDocument,
  migrateLedger,
  createProforma,
  confirmPayment,
  createStore,
  parseAmount,
} = api;
const configA = normalizeCompany({
  nameTc: "演示甲公司",
  nameEn: "DEMO COMPANY A",
  bankName: "BANK A",
  bankAccount: "00000001",
  signatoryEn: "SIGNER A",
  signatoryTc: "SIGNER A",
  contractPrefix: "DEMOA",
});
const configB = normalizeCompany({
  nameTc: "演示乙公司",
  nameEn: "DEMO COMPANY B",
  bankName: "BANK B",
  bankAccount: "00000002",
  signatoryEn: "SIGNER B",
  signatoryTc: "SIGNER B",
  contractPrefix: "DEMOB",
});
const seed = { v: 1, clients: [], docs: [], company: configA };
const workspaceState = () =>
  migrateLedger({ ...clone(demo), company: configA }, configA);
const form = {
  customer: demo.clients[0].id,
  date: "2026-11-13",
  mode: "auto",
  contract: "",
  item: "測試服務",
  itemEn: "Fictional services",
  currency: "HKD",
  amount: "1234.50",
};
const payments = { paid: "2026-11-13", issued: "2026-11-13", ref: "DEMO-REF" };
// A shared lock implementation exercises serialisation across two independent stores.
function memoryStore({ initial = null, failKey = null, locks = true } = {}) {
  const values = new Map(
    initial === null
      ? []
      : [
          [
            "test",
            typeof initial === "string" ? initial : JSON.stringify(initial),
          ],
        ],
  );
  const storage = {
    getItem: (k) => values.get(k) ?? null,
    setItem: (k, v) => {
      if (k === failKey) throw Error("Simulated storage quota");
      values.set(k, v);
    },
    removeItem: (k) => values.delete(k),
  };
  let tail = Promise.resolve();
  const lock = {
    request: (_name, fn) => {
      const run = tail.then(fn);
      tail = run.catch(() => {});
      return run;
    },
  };
  const make = () =>
    createStore({
      storage,
      key: "test",
      seed,
      locks: locks ? lock : null,
      fallbackCompany: () => configA,
    });
  return { storage, values, make };
}
async function main() {
  let count = 0;
  const check = async (name, fn) => {
    await fn();
    count++;
    console.log("PASS " + name);
  };
  await check("fresh ledger contains no clients or transactions", () => {
    assert.equal(seed.clients.length, 0);
    assert.equal(seed.docs.length, 0);
  });
  await check("fictional legacy demo ledger validates", () => {
    validate(demo);
    assert.equal(demo.docs.length, 2);
  });
  await check("first merge imports both records", () => {
    const r = mergeBackup(seed, demo);
    assert.equal(r.added, 2);
    assert.equal(r.next.clients.length, 1);
  });
  const merged = mergeBackup(seed, demo).next;
  await check("repeat import is idempotent", () => {
    const r = mergeBackup(merged, demo);
    assert.equal(r.added, 0);
    assert.equal(r.skipped, 2);
  });
  for (const [field, value] of [
    ["amount", 100],
    ["currency", "USD"],
  ])
    await check(field + " conflict blocks import without mutation", () => {
      const incoming = clone(demo);
      incoming.docs[0][field] = value;
      const before = JSON.stringify(merged);
      assert.throws(() => mergeBackup(merged, incoming));
      assert.equal(JSON.stringify(merged), before);
    });
  await check("receipt status conflict blocks import", () => {
    const incoming = clone(demo);
    incoming.docs[1].status = "已取消";
    assert.throws(() => mergeBackup(merged, incoming));
  });
  await check("invalid calendar date is rejected", () => {
    const x = clone(demo);
    x.docs[0].date = "2026-02-30";
    assert.throws(() => validate(x));
  });
  await check("duplicate document numbers are rejected", () => {
    const x = clone(demo);
    x.docs[1].pi = x.docs[0].pi;
    assert.throws(() => validate(x));
  });
  await check("paid record requires invoice and receipt", () => {
    const x = clone(demo);
    delete x.docs[1].rc;
    assert.throws(() => validate(x));
  });
  await check("PI sequence accounts for existing records", () =>
    assert.equal(seq(merged, "PI", "2026"), "PI-2026-003"),
  );
  await check("INV sequence advances after latest issued number", () =>
    assert.equal(seq(merged, "INV", "2026"), "INV-2026-002"),
  );
  await check("year changes start a distinct sequence", () =>
    assert.equal(seq(merged, "INV", "2027"), "INV-2027-001"),
  );
  await check("settings reject invalid time zones", () =>
    assert.throws(() => normalizeCompany({ timeZone: "invalid/zone" })),
  );
  await check("settings reject invalid contract prefixes", () =>
    assert.throws(() => normalizeCompany({ contractPrefix: "bad-prefix" })),
  );
  await check("settings ignore unknown fields", () =>
    assert.equal(normalizeCompany({ unknown: "value" }).unknown, undefined),
  );
  await check("template escapes issuer, customer and item input", () => {
    const d = workspaceState().docs[0];
    d.issuer.company.nameTc = "<img src=x onerror=alert(1)>";
    d.customer.name = "<script>customer</script>";
    d.item = "<svg onload=alert(1)>";
    const html = renderDocument(d, "pi");
    assert.ok(html.includes("&lt;img"));
    assert.ok(html.includes("&lt;script"));
    assert.ok(html.includes("&lt;svg"));
    assert.ok(!html.includes("<img src=x"));
  });
  await check("HKD and USD remain distinct in documents", () => {
    const docs = workspaceState().docs;
    assert.ok(renderDocument(docs[0], "pi").includes("HKD 1,234.50"));
    assert.ok(renderDocument(docs[1], "inv").includes("USD 250.00"));
  });
  await check("corrupt ledger fails closed without replacing bytes", () => {
    const m = memoryStore({ initial: "{broken" });
    assert.throws(() => m.make().read());
    assert.equal(m.storage.getItem("test"), "{broken");
  });
  await check(
    "offline build has pure modules before UI without external scripts",
    () => {
      const h = fs.readFileSync(
        path.join(__dirname, "../dist/Billing-Workspace.html"),
        "utf8",
      );
      assert.ok(
        h.indexOf("root.BillingCompany") <
          h.indexOf("BillingStorage.createStore"),
      );
      assert.ok(
        h.indexOf("root.BillingStorage") <
          h.indexOf("BillingStorage.createStore"),
      );
      assert.ok(!h.includes("<script src="));
    },
  );
  const stateA = workspaceState(),
    workspace = createWorkspaceBackup(stateA, configA);
  await check(
    "v3 backup contains issuer snapshots and current company settings",
    () => {
      assert.equal(workspace.version, 3);
      assert.equal(workspace.company.nameEn, "DEMO COMPANY A");
      assert.equal(workspace.ledger.docs.length, 2);
      assert.equal(workspace.ledger.company, undefined);
      assert.ok(workspace.ledger.docs.every((d) => d.issuer));
    },
  );
  await check("backup is an independent snapshot", () => {
    const x = createWorkspaceBackup(stateA, configA);
    x.ledger.docs[0].amount = 10;
    x.ledger.docs[0].issuer.company.nameEn = "CHANGED";
    assert.equal(stateA.docs[0].amount, 123450);
    assert.equal(stateA.docs[0].issuer.company.nameEn, configA.nameEn);
  });
  await check(
    "legacy ledger backup is accepted without inventing company settings",
    () => {
      const x = decodeWorkspaceBackup(demo);
      assert.equal(x.legacy, true);
      assert.equal(x.company, null);
    },
  );
  await check("v2 backups remain accepted", () => {
    const x = decodeWorkspaceBackup({ ...workspace, version: 2 });
    assert.equal(x.company.nameEn, configA.nameEn);
  });
  await check("future backup versions are rejected", () =>
    assert.throws(() => decodeWorkspaceBackup({ ...workspace, version: 99 })),
  );
  await check("v3 missing snapshots cannot silently become legacy", () => {
    const x = clone(workspace);
    delete x.ledger.docs[0].issuer;
    assert.throws(() => decodeWorkspaceBackup(x));
  });
  await check("malformed company settings stop the entire restore", () =>
    assert.throws(() =>
      decodeWorkspaceBackup({
        ...workspace,
        company: { ...configA, timeZone: "bad/timezone" },
      }),
    ),
  );
  await check(
    "company settings stay unchanged unless explicitly selected",
    () => {
      const x = planWorkspaceRestore(
        { ...clone(seed), company: configB },
        decodeWorkspaceBackup(workspace),
        false,
      );
      assert.equal(x.next.company.nameEn, configB.nameEn);
      assert.equal(x.added, 2);
      assert.equal(x.next.docs[0].issuer.company.nameEn, configA.nameEn);
    },
  );
  await check(
    "selected migration restores both ledger and current company",
    () => {
      const x = planWorkspaceRestore(
        { ...clone(seed), company: configB },
        decodeWorkspaceBackup(workspace),
        true,
      );
      assert.equal(x.next.company.nameEn, configA.nameEn);
      assert.equal(x.next.docs.length, 2);
    },
  );
  await check("company-only restore preserves old document issuers", () => {
    const existing = workspaceState();
    existing.company = configB;
    const x = planWorkspaceRestore(
      existing,
      decodeWorkspaceBackup(workspace),
      true,
    );
    assert.equal(x.added, 0);
    assert.equal(x.companyChanged, true);
    assert.equal(x.next.docs[0].issuer.company.nameEn, configA.nameEn);
  });
  await check(
    "ledger conflicts block company restoration without mutation",
    () => {
      const incoming = clone(workspace);
      incoming.ledger.docs[0].amount = 1;
      const before = JSON.stringify(stateA);
      assert.throws(() =>
        planWorkspaceRestore(stateA, decodeWorkspaceBackup(incoming), true),
      );
      assert.equal(JSON.stringify(stateA), before);
    },
  );
  await check(
    "restore atomically saves ledger and settings and keeps pre-import workspace",
    async () => {
      const m = memoryStore({ initial: { ...clone(demo), company: configB } }),
        s = m.make();
      await s.transaction(
        (current) =>
          Object.assign(
            current,
            planWorkspaceRestore(
              current,
              decodeWorkspaceBackup({
                ...workspace,
                ledger: { ...workspace.ledger, docs: [] },
              }),
              true,
            ).next,
          ),
        { beforeImport: true },
      );
      const actual = JSON.parse(m.storage.getItem("test"));
      assert.equal(actual.company.nameEn, configA.nameEn);
      assert.equal(actual.docs.length, 2);
      const before = decodeWorkspaceBackup(
        JSON.parse(m.storage.getItem("test-before-import")),
      );
      assert.equal(before.company.nameEn, configB.nameEn);
    },
  );
  await check(
    "failed final save preserves original ledger and settings",
    async () => {
      const initial = { ...clone(demo), company: configB },
        m = memoryStore({ initial, failKey: "test" });
      const before = m.storage.getItem("test");
      await assert.rejects(
        m.make().transaction((x) => {
          x.company = configA;
        }),
      );
      assert.equal(m.storage.getItem("test"), before);
    },
  );
  await check("legacy company migration marks its limited provenance", () => {
    const x = migrateLedger(demo, configA);
    assert.equal(x.docs[0].issuer.source, "legacy-baseline");
    assert.equal(x.docs[0].issuer.company.nameEn, configA.nameEn);
    assert.equal(demo.docs[0].issuer, undefined);
  });
  await check(
    "legacy baseline is pinned before company settings change",
    async () => {
      const m = memoryStore({ initial: { ...clone(demo), company: configA } });
      await m.make().transaction((x) => {
        x.company = configB;
      });
      const actual = m.make().read();
      assert.equal(actual.company.nameEn, configB.nameEn);
      assert.equal(actual.docs[0].issuer.company.nameEn, configA.nameEn);
      assert.equal(
        JSON.parse(m.storage.getItem("test-before-snapshots")).docs[0].issuer,
        undefined,
      );
    },
  );
  await check(
    "legacy import uses backup company even without restoring live settings",
    () => {
      const v2 = { ...clone(workspace), version: 2 };
      for (const d of v2.ledger.docs) delete d.issuer;
      const x = planWorkspaceRestore(
        { ...clone(seed), company: configB },
        decodeWorkspaceBackup(v2),
        false,
      );
      assert.equal(x.next.company.nameEn, configB.nameEn);
      assert.equal(x.next.docs[0].issuer.company.nameEn, configA.nameEn);
      assert.equal(x.legacyBaselines, 2);
    },
  );
  await check(
    "legacy import without company uses an explicitly marked current baseline",
    () => {
      const x = planWorkspaceRestore(seed, decodeWorkspaceBackup(demo), false);
      assert.equal(x.next.docs[0].issuer.source, "legacy-baseline");
      assert.equal(x.legacyBaselines, 2);
    },
  );
  await check(
    "new PI captures an independent, complete issuer snapshot",
    () => {
      const s = { ...clone(seed), clients: clone(demo.clients) };
      const d = createProforma(s, form, "new");
      s.company.nameEn = "CHANGED";
      assert.equal(d.issuer.company.nameEn, configA.nameEn);
      assert.equal(d.issuer.source, "issued");
      assert.equal(d.amount, 123450);
    },
  );
  await check(
    "changing current company never changes old PI, INV or RC company content",
    () => {
      const s = { ...clone(seed), clients: clone(demo.clients) };
      const d = createProforma(s, form, "new"),
        before = renderDocument(d, "pi");
      s.company = configB;
      confirmPayment(s, d.id, payments, "2026-11-13");
      assert.equal(renderDocument(d, "pi"), before);
      for (const k of ["inv", "rc"]) {
        const html = renderDocument(d, k);
        assert.ok(html.includes("DEMO COMPANY A"));
        assert.ok(html.includes("SIGNER A"));
        assert.ok(!html.includes("DEMO COMPANY B"));
      }
    },
  );
  await check("new business after a company change uses the new issuer", () => {
    const s = { ...clone(seed), clients: clone(demo.clients) };
    createProforma(s, form, "old");
    s.company = configB;
    const d = createProforma(s, form, "new");
    assert.equal(d.issuer.company.nameEn, configB.nameEn);
    assert.ok(d.contract.startsWith("DEMOB-"));
  });
  await check(
    "issued snapshot cannot be changed through storage transactions",
    async () => {
      const m = memoryStore({ initial: workspaceState() });
      await assert.rejects(
        m.make().transaction((x) => {
          x.docs[0].issuer.company.nameEn = "CHANGED";
        }),
        /cannot be changed/,
      );
      assert.equal(
        m.make().read().docs[0].issuer.company.nameEn,
        configA.nameEn,
      );
    },
  );
  await check(
    "incomplete snapshots are rejected rather than filled with demo defaults",
    () => {
      const x = workspaceState();
      delete x.docs[0].issuer.company.bankName;
      assert.throws(() => validate(x), /Incomplete/);
    },
  );
  await check("same-number backups with different issuers are rejected", () => {
    const x = workspaceState(),
      y = workspaceState();
    y.docs[0].issuer.company = configB;
    assert.throws(() => mergeBackup(x, y), /簽發方/);
  });
  await check("payment confirmation is idempotent", () => {
    const s = { ...clone(seed), clients: clone(demo.clients) },
      d = createProforma(s, form, "new");
    confirmPayment(s, d.id, payments, "2026-11-13");
    const before = JSON.stringify(s);
    confirmPayment(s, d.id, payments, "2026-11-13");
    assert.equal(JSON.stringify(s), before);
    assert.equal(d.inv, "INV-2026-001");
    assert.equal(d.rc, "RC-2026-001");
  });
  await check("cancelled business cannot be marked as paid", () => {
    const s = workspaceState();
    s.docs[0].status = "已取消";
    assert.throws(() =>
      confirmPayment(s, s.docs[0].id, payments, "2026-11-13"),
    );
  });
  await check(
    "future payment dates and issue dates before payment are rejected",
    () => {
      const s = workspaceState();
      assert.throws(() =>
        confirmPayment(
          s,
          s.docs[0].id,
          { ...payments, paid: "2027-01-01" },
          "2026-11-13",
        ),
      );
      assert.throws(() =>
        confirmPayment(
          s,
          s.docs[0].id,
          { ...payments, issued: "2026-11-12" },
          "2026-11-13",
        ),
      );
    },
  );
  await check(
    "amount parser keeps exact cents and rejects unsupported precision",
    () => {
      assert.equal(parseAmount("0.29"), 29);
      assert.equal(parseAmount("1.01"), 101);
      for (const x of [
        "1.005",
        "-1",
        "NaN",
        "1e3",
        "0",
        "999999999999999999999",
      ])
        assert.throws(() => parseAmount(x));
    },
  );
  await check(
    "two stores preserve simultaneous creates with unique numbers",
    async () => {
      const m = memoryStore({
        initial: { ...clone(seed), clients: clone(demo.clients) },
      });
      await Promise.all(
        Array.from({ length: 20 }, (_, i) =>
          m
            .make()
            .transaction((s) => createProforma(s, form, "concurrent-" + i)),
        ),
      );
      const actual = m.make().read();
      assert.equal(actual.docs.length, 20);
      assert.equal(new Set(actual.docs.map((d) => d.pi)).size, 20);
      assert.equal(new Set(actual.docs.map((d) => d.contract)).size, 20);
    },
  );
  await check(
    "two stores confirming the same payment allocate once",
    async () => {
      const s = { ...clone(seed), clients: clone(demo.clients) };
      createProforma(s, form, "pay");
      const m = memoryStore({ initial: s });
      await Promise.all(
        [m.make(), m.make()].map((x) =>
          x.transaction((s) =>
            confirmPayment(s, "pay", payments, "2026-11-13"),
          ),
        ),
      );
      assert.equal(m.make().read().docs[0].inv, "INV-2026-001");
    },
  );
  await check(
    "browsers without a cross-tab lock remain readable and refuse unsafe writes",
    async () => {
      const m = memoryStore({ initial: workspaceState(), locks: false });
      assert.equal(m.make().read().docs.length, 2);
      await assert.rejects(
        m.make().transaction((s) => {
          s.company = configB;
        }),
        /cannot safely/,
      );
      assert.equal(m.make().read().company.nameEn, configA.nameEn);
    },
  );
  await check(
    "PDF pages preserve every raster row without splitting text lines",
    () => {
      const lines = [
          [900, 940],
          [1900, 1950],
          [2900, 2950],
        ],
        slices = api.pageSlices(3200, 920, lines);
      assert.equal(slices[0][0], 0);
      assert.equal(slices.at(-1)[1], 3200);
      for (let i = 0; i < slices.length; i++) {
        const [start, end] = slices[i];
        assert.ok(end > start && end - start <= 920);
        if (i) assert.equal(start, slices[i - 1][1]);
        for (const [top, bottom] of lines)
          assert.ok(!(top < end && bottom > end));
      }
    },
  );
  console.log(count + " checks passed");
}
if (require.main === module)
  main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
module.exports = { api, fixture: demo };
