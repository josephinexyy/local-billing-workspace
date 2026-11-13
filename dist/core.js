"use strict";
(function (root, factory) {
  if (typeof module === "object" && module.exports)
    module.exports = factory(require("./company.js"));
  else root.BillingCore = factory(root.BillingCompany);
})(globalThis, function (Company) {
  const { normalizeCompany } = Company;
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const currencyOf = (d) => (d.currency === undefined ? "HKD" : d.currency);
  const money = (n) =>
    (n / 100).toLocaleString("en-HK", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  const amountDue = (d) => currencyOf(d) + " " + money(d.amount);
  function validate(s) {
    if (s?.company !== undefined) normalizeCompany(s.company);
    if (s.v !== 1 || !Array.isArray(s.clients) || !Array.isArray(s.docs))
      throw Error("備份格式不符");
    if (
      s.retiredPI !== undefined &&
      (!Array.isArray(s.retiredPI) ||
        !s.retiredPI.every((n) => typeof n === "string" && n.trim()))
    )
      throw Error("備份格式不符");
    const unique = (a) => new Set(a).size === a.length;
    const str = (x) => typeof x === "string" && x.trim();
    const dt = (x) =>
      typeof x === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(x) &&
      !Number.isNaN(Date.parse(x)) &&
      new Date(x + "T00:00:00Z").toISOString().slice(0, 10) === x;
    for (const c of [...s.clients, ...s.docs.map((d) => d.customer)])
      if (
        !c ||
        !str(c.id) ||
        !str(c.name) ||
        !["en", "br", "address"].every((k) => typeof c[k] === "string")
      )
        throw Error("客戶資料不完整");
    for (const d of s.docs)
      if (
        !["HKD", "USD"].includes(currencyOf(d)) ||
        !str(d.id) ||
        !str(d.pi) ||
        !str(d.item) ||
        typeof d.contract !== "string" ||
        !dt(d.date) ||
        !Number.isSafeInteger(d.amount) ||
        d.amount <= 0 ||
        !["待收款", "已收款", "已取消"].includes(d.status) ||
        (d.status === "已收款" &&
          (!str(d.inv) ||
            !str(d.rc) ||
            !dt(d.paid) ||
            !dt(d.issued) ||
            d.issued < d.paid))
      )
        throw Error("單據資料不完整");
    for (const d of s.docs)
      if (d.issuer !== undefined) validateIssuer(d.issuer);
    for (const a of [
      s.clients.map((c) => c.id),
      s.docs.map((d) => d.id),
      s.docs
        .flatMap((d) => [d.pi, d.inv, d.rc].filter(Boolean))
        .concat(s.retiredPI || []),
    ])
      if (!unique(a)) throw Error("編號重複");
  }
  function canDelete(d) {
    return d?.status === "已取消" && !d.inv && !d.rc && !d.paid && !d.issued;
  }
  function removeCancelled(s, id) {
    const index = s.docs.findIndex((d) => d.id === id);
    if (!canDelete(s.docs[index])) throw Error("此單據已處理");
    s.docs.splice(index, 1);
  }
  function seq(s, p, y) {
    const prefix = p + "-" + y + "-";
    const field = { PI: "pi", INV: "inv", RC: "rc" }[p];
    const used = new Set(
      s.docs
        .map((d) => d[field])
        .filter(
          (id) =>
            typeof id === "string" &&
            id.startsWith(prefix) &&
            /^\d+$/.test(id.slice(prefix.length)),
        )
        .map((id) => Number(id.slice(prefix.length))),
    );
    let n = 1;
    if (p === "PI") {
      while (used.has(n)) n++;
    } else {
      for (const issued of used) n = Math.max(n, issued + 1);
    }
    return prefix + String(n).padStart(3, "0");
  }

  const validDate = (x) =>
    typeof x === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(x) &&
    !Number.isNaN(Date.parse(x)) &&
    new Date(x + "T00:00:00Z").toISOString().slice(0, 10) === x;
  function validateIssuer(issuer) {
    if (
      !issuer ||
      issuer.version !== 1 ||
      !["issued", "legacy-baseline"].includes(issuer.source)
    )
      throw Error("Invalid issuer snapshot");
    const normalized = normalizeCompany(issuer.company);
    // A snapshot must be complete. Defaults must never silently fill missing history.
    for (const k of Object.keys(normalized))
      if (
        typeof issuer.company[k] !== "string" ||
        issuer.company[k] !== normalized[k]
      )
        throw Error("Incomplete issuer snapshot: " + k);
  }
  function snapshotCompany(settings, source = "issued") {
    const issuer = { version: 1, source, company: normalizeCompany(settings) };
    validateIssuer(issuer);
    return issuer;
  }
  function migrateLedger(input, fallbackCompany) {
    validate(input);
    const next = clone(input);
    next.company = normalizeCompany(next.company || fallbackCompany);
    delete next.retiredPI;
    for (const doc of next.docs)
      if (!doc.issuer)
        doc.issuer = snapshotCompany(next.company, "legacy-baseline");
    validate(next);
    return next;
  }
  function parseAmount(value) {
    const text = String(value).trim();
    if (!/^\d+(?:\.\d{1,2})?$/.test(text))
      throw Error("Enter a positive amount with at most two decimal places");
    const [whole, fraction = ""] = text.split(".");
    const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
    if (!Number.isSafeInteger(cents) || cents <= 0 || cents > 99999999900)
      throw Error("Amount is outside the supported range");
    return cents;
  }
  function contractNumber(s, c, date) {
    const initials = (c.en || "").toUpperCase().match(/[A-Z0-9]+/g) || [];
    const code =
      initials
        .find((x) => !["LIMITED", "LTD", "THE"].includes(x))
        ?.slice(0, 10) ||
      String(c.br || c.id)
        .replace(/[^A-Za-z0-9]/g, "")
        .slice(0, 8)
        .toUpperCase() ||
      "CLIENT";
    const base =
      s.company.contractPrefix + "-" + code + "-" + date.replaceAll("-", "");
    const used = new Set(s.docs.map((d) => d.contract));
    let id = base;
    for (let i = 2; used.has(id); i++)
      id = base + "-" + String(i).padStart(2, "0");
    return id;
  }

  function createProforma(state, values, id) {
    const customer = state.clients.find((c) => c.id === values.customer);
    if (!customer) throw Error("客戶資料不完整");
    if (!validDate(values.date)) throw Error("Invalid pro forma date");
    const contract =
      values.mode === "auto"
        ? contractNumber(state, customer, values.date)
        : values.contract.trim();
    if (!values.item.trim() || !contract)
      throw Error("Enter a service and contract reference");
    const doc = {
      id,
      pi: seq(state, "PI", values.date.slice(0, 4)),
      customer: clone(customer),
      contract,
      item: values.item.trim(),
      itemEn: (values.itemEn || "").trim(),
      date: values.date,
      currency: values.currency,
      amount: parseAmount(values.amount),
      status: "待收款",
      issuer: snapshotCompany(state.company),
    };
    state.docs.push(doc);
    validate(state);
    return doc;
  }
  function confirmPayment(state, id, values, today) {
    const doc = state.docs.find((d) => d.id === id);
    if (!doc || doc.status === "已取消") throw Error("此單據已處理");
    // Idempotent: a repeated confirmation never allocates new numbers.
    if (doc.status === "已收款") return doc;
    if (
      !validDate(values.paid) ||
      !validDate(values.issued) ||
      values.issued < values.paid ||
      values.paid > today ||
      values.issued > today
    )
      throw Error("Invalid payment or issue date");
    const year = values.issued.slice(0, 4);
    Object.assign(doc, {
      paid: values.paid,
      issued: values.issued,
      ref: values.ref || "",
      inv: seq(state, "INV", year),
      rc: seq(state, "RC", year),
      status: "已收款",
    });
    validate(state);
    return doc;
  }
  function cancelDocument(state, id, expectedStatus) {
    const doc = state.docs.find((d) => d.id === id);
    if (!doc || doc.status !== expectedStatus || doc.status === "已取消")
      throw Error("此單據已處理");
    doc.status = "已取消";
  }
  function mergeBackup(current, incoming) {
    validate(current);
    validate(incoming);
    const next = JSON.parse(JSON.stringify(current));
    let added = 0,
      skipped = 0;
    const normal = (c) =>
      c.br.trim()
        ? "br:" + c.br.replace(/\D/g, "")
        : "name:" + c.name.trim() + "|" + c.en.trim().toUpperCase();
    const clientMap = new Map();
    for (const c of incoming.clients) {
      const same = next.clients.find((x) => normal(x) === normal(c));
      if (same) {
        clientMap.set(c.id, same.id);
        continue;
      }
      if (next.clients.some((x) => x.id === c.id))
        throw Error("客戶識別碼衝突：" + c.name);
      next.clients.push({ ...c });
      clientMap.set(c.id, c.id);
    }
    for (const d of incoming.docs) {
      const old = next.docs.find((x) => x.pi === d.pi || x.id === d.id);
      if (old) {
        const same =
          old.pi === d.pi &&
          old.contract === d.contract &&
          old.date === d.date &&
          old.amount === d.amount &&
          currencyOf(old) === currencyOf(d) &&
          normal(old.customer) === normal(d.customer) &&
          old.item === d.item &&
          (old.itemEn || "") === (d.itemEn || "");
        if (
          old.issuer &&
          d.issuer &&
          JSON.stringify(old.issuer.company) !==
            JSON.stringify(d.issuer.company)
        )
          throw Error("同號簽發方資料不一致，未匯入：" + d.pi);
        if (!same) throw Error("同號資料不一致，未匯入：" + d.pi);
        if (
          d.status !== "待收款" &&
          (d.status !== old.status ||
            d.inv !== old.inv ||
            d.rc !== old.rc ||
            d.paid !== old.paid ||
            d.issued !== old.issued)
        )
          throw Error("收款或作廢狀態衝突，未匯入：" + d.pi);
        skipped++;
        continue;
      }
      const copy = JSON.parse(JSON.stringify(d));
      copy.customer.id = clientMap.get(d.customer.id) || d.customer.id;
      next.docs.push(copy);
      added++;
    }
    validate(next);
    return { next, added, skipped };
  }

  return {
    clone,
    currencyOf,
    money,
    amountDue,
    validate,
    canDelete,
    removeCancelled,
    seq,
    validDate,
    validateIssuer,
    snapshotCompany,
    migrateLedger,
    parseAmount,
    contractNumber,
    createProforma,
    confirmPayment,
    cancelDocument,
    mergeBackup,
  };
});
