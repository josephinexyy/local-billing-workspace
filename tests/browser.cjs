"use strict";
const { test, before, after } = require("node:test");
const crypto = require("node:crypto");
const assert = require("node:assert/strict"),
  http = require("node:http"),
  fs = require("node:fs/promises"),
  path = require("node:path"),
  os = require("node:os");
const { chromium } = require("playwright");
const { api, fixture } = require("./helpers.cjs");
const dist = path.resolve(__dirname, "../dist");
const key = "local-billing-ledger-v1";
let browser, server, base, artifacts;
const companyA = api.normalizeCompany({
  nameTc: "演示甲公司",
  nameEn: "DEMO COMPANY A",
  bankName: "BANK A",
  bankAccount: "00000001",
  signatoryTc: "SIGNER A",
  signatoryEn: "SIGNER A",
  contractPrefix: "DEMOA",
});
const companyB = api.normalizeCompany({
  nameTc: "演示乙公司",
  nameEn: "DEMO COMPANY B",
  bankName: "BANK B",
  bankAccount: "00000002",
  signatoryTc: "SIGNER B",
  signatoryEn: "SIGNER B",
  contractPrefix: "DEMOB",
});
before(
  async () => {
    artifacts = await fs.mkdtemp(path.join(os.tmpdir(), "billing-browser-"));
    server = http.createServer(async (req, res) => {
      const relative = decodeURIComponent(
          new URL(req.url, "http://localhost").pathname,
        ),
        file = path.resolve(
          dist,
          "." + (relative === "/" ? "/index.html" : relative),
        );
      if (!file.startsWith(dist + path.sep)) {
        res.writeHead(403).end();
        return;
      }
      try {
        const bytes = await fs.readFile(file);
        res.setHeader(
          "Content-Type",
          file.endsWith(".html")
            ? "text/html; charset=utf-8"
            : file.endsWith(".js")
              ? "text/javascript; charset=utf-8"
              : file.endsWith(".woff")
                ? "font/woff"
                : "application/octet-stream",
        );
        res.end(bytes);
      } catch {
        res.writeHead(404).end();
      }
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = "http://127.0.0.1:" + server.address().port;
    browser = await chromium.launch({
      headless: true,
      ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
        ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
        : {}),
    });
  },
  { timeout: 60000 },
);
after(async () => {
  await browser?.close();
  if (server) await new Promise((resolve) => server.close(resolve));
  if (artifacts) await fs.rm(artifacts, { recursive: true, force: true });
});
async function fresh(
  t,
  state = { v: 1, clients: [], docs: [], company: companyA },
  route = "/",
) {
  const context = await browser.newContext({
      acceptDownloads: true,
      viewport: { width: 1280, height: 900 },
    }),
    page = await context.newPage(),
    errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("dialog", async (dialog) => {
    errors.push("Unexpected dialog: " + dialog.message());
    await dialog.dismiss();
  });
  await context.addInitScript(
    ({ key, state }) => {
      if (!localStorage.getItem(key)) {
        localStorage.setItem(key, JSON.stringify(state));
        localStorage.setItem("local-billing-ui", "en");
        localStorage.setItem("local-billing-output", "en");
      }
    },
    { key, state },
  );
  await page.goto(base + route);
  await page.locator("#newpi").waitFor();
  t.after(async () => {
    if (t.passed === false)
      await page
        .screenshot({
          path: path.join(artifacts, t.name.replace(/\W/g, "_") + ".png"),
          fullPage: true,
        })
        .catch(() => {});
    await context.close();
    assert.deepEqual(errors, [], "Browser runtime errors");
  });
  return { page, context, errors };
}
async function ledger(page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)), key);
}
async function settle(page, predicate) {
  await page.waitForFunction(predicate, key);
}
async function closeModal(page) {
  if (await page.locator("#dlg").isVisible())
    await page.locator("#close").click();
}
async function issue(
  page,
  { amount = "1234.50", currency = "HKD", item, itemEn } = {},
) {
  await page.locator("#newpi").click();
  // Empty workspaces ask for a customer first.
  if (await page.locator('#form [name="name"]').count()) {
    await page.locator('[name="name"]').fill("示例客戶有限公司");
    await page.locator('[name="en"]').fill("EXAMPLE CUSTOMER LIMITED");
    await page.locator('[name="address"]').fill("Fictional address");
    await page.locator("#form button.primary").click();
  }
  await page.locator('#form [name="amount"]').fill(amount);
  await page.locator('#form [name="currency"]').selectOption(currency);
  if (item) {
    await page.locator('#form [name="item"]').fill(item);
    await page
      .locator('#form [name="itemEn"]')
      .fill(itemEn || "Fictional services");
  }
  await page.locator("#form button.primary").click();
  await page.locator("#body .doc").waitFor();
  return (await ledger(page)).docs.at(-1);
}
async function download(page, locator) {
  const promise = page.waitForEvent("download");
  await locator.click();
  const dl = await promise;
  const file = path.join(
    artifacts,
    crypto.randomUUID() + "-" + dl.suggestedFilename(),
  );
  await dl.saveAs(file);
  return file;
}
async function pay(page) {
  await page.locator('#body [data-act="view"]').click();
  await page.locator('#body [data-act="pay"]').click();
  await page.locator("#form button.primary").click();
  await page.locator('#body [data-act="pair"]').waitFor();
}
async function settings(page, company) {
  await closeModal(page);
  await page.locator("#settings").click();
  for (const [name, value] of Object.entries(company))
    await page.locator('#form [name="' + name + '"]').fill(value);
  await page.locator("#form button.primary").click();
  await page.locator("#dlg").waitFor({ state: "hidden" });
}
async function backup(page) {
  await closeModal(page);
  await page.locator('[data-tab="備份與匯出"]').click();
  const file = await download(page, page.locator('[data-act="backup"]'));
  return { file, data: JSON.parse(await fs.readFile(file, "utf8")) };
}
async function restore(page, file, { restoreCompany = true } = {}) {
  await page.locator('[data-tab="備份與匯出"]').click();
  const choose = page.waitForEvent("filechooser");
  await page.locator('[data-act="restore"]').click();
  await (await choose).setFiles(file);
  await page.locator('[data-act="import-confirm"]').waitFor();
  if (restoreCompany) await page.locator("#restore-company").check();
  await page.locator('[data-act="import-confirm"]').click();
  await page.locator("#dlg").waitFor({ state: "hidden" });
}
async function pdfInfo(page, file) {
  const bytes = await fs.readFile(file);
  assert.ok(bytes.subarray(0, 5).toString() === "%PDF-");
  return page.evaluate(async (bytes) => {
    const pdf = await PDFLib.PDFDocument.load(new Uint8Array(bytes));
    return pdf.getPages().map((page) => ({
      size: page.getSize(),
      images: page.node
        .Resources()
        .lookup(PDFLib.PDFName.of("XObject"), PDFLib.PDFDict)
        .entries()
        .map(([name, ref]) => {
          const image = pdf.context.lookup(ref);
          return {
            width: image.dict.lookup(PDFLib.PDFName.of("Width")).asNumber(),
            height: image.dict.lookup(PDFLib.PDFName.of("Height")).asNumber(),
          };
        }),
    }));
  }, Array.from(bytes));
}
test(
  "create PI, confirm payment and download valid single and paired PDFs",
  { timeout: 90000 },
  async (t) => {
    const { page } = await fresh(t);
    const doc = await issue(page);
    assert.equal(doc.pi, "PI-" + doc.date.slice(0, 4) + "-001");
    assert.equal(doc.issuer.company.nameEn, companyA.nameEn);
    assert.equal(doc.amount, 123450);
    const pdf = await download(page, page.locator(".pdf-download"));
    const info = await pdfInfo(page, pdf);
    assert.equal(info.length, 1);
    assert.ok(Math.abs(info[0].size.width - 595.28) < 0.1);
    await pay(page);
    const paid = (await ledger(page)).docs[0];
    assert.equal(paid.status, "已收款");
    assert.equal(paid.inv.replace("INV", "RC"), paid.rc);
    const zipFile = await download(
      page,
      page.locator('#body [data-act="pair"]'),
    );
    const zip = Array.from(await fs.readFile(zipFile));
    const files = await page.evaluate(async (bytes) => {
      const files = fflate.unzipSync(new Uint8Array(bytes));
      const result = [];
      for (const [name, data] of Object.entries(files))
        result.push({
          name,
          pages: (await PDFLib.PDFDocument.load(data)).getPageCount(),
        });
      return result;
    }, zip);
    assert.equal(files.length, 2);
    assert.ok(files.every((x) => x.pages === 1 && x.name.endsWith(".pdf")));
  },
);
test(
  "company changes preserve old PI, invoice and receipt and apply to new business",
  { timeout: 90000 },
  async (t) => {
    const { page } = await fresh(t);
    const old = await issue(page),
      before = await page.locator(".doc").textContent();
    await settings(page, companyB);
    await page.locator('[data-act="view"]').first().click();
    await page.locator('[data-act="pi"]').last().click();
    assert.equal(await page.locator(".doc").textContent(), before);
    await pay(page);
    for (const kind of ["inv", "rc"]) {
      await page
        .locator('#body [data-act="' + kind + '"]')
        .last()
        .click();
      const text = await page.locator(".doc").textContent();
      assert.ok(text.includes(companyA.nameEn) && text.includes("SIGNER A"));
      assert.ok(!text.includes(companyB.nameEn));
    }
    await closeModal(page);
    const next = await issue(page);
    assert.equal(next.issuer.company.nameEn, companyB.nameEn);
    assert.equal((await ledger(page)).docs[0].id, old.id);
  },
);
test(
  "double submission of payment form issues just one INV and RC",
  { timeout: 90000 },
  async (t) => {
    const { page } = await fresh(t);
    await issue(page);
    await page.locator('#body [data-act="view"]').click();
    await page.locator('[data-act="pay"]').click();
    // Two native submissions in the same event turn reproduce a fast double click.
    await page.locator("#form").evaluate((form) => {
      form.requestSubmit();
      form.requestSubmit();
    });
    await page.locator('#body [data-act="pair"]').waitFor();
    const actual = await ledger(page);
    assert.equal(actual.docs.length, 1);
    assert.ok(actual.docs[0].inv.endsWith("-001"));
    assert.ok(actual.docs[0].rc.endsWith("-001"));
  },
);
test(
  "backup restores an empty browser with exact records, currencies, settings and snapshots",
  { timeout: 120000 },
  async (t) => {
    const { page } = await fresh(t);
    await issue(page);
    await pay(page);
    await closeModal(page);
    await issue(page, { amount: "250.00", currency: "USD" });
    await settings(page, companyB);
    const exported = await backup(page);
    assert.equal(exported.data.version, 3);
    const other = await fresh(t, {
      v: 1,
      clients: [],
      docs: [],
      company: api.normalizeCompany({ nameEn: "EMPTY DESTINATION" }),
    });
    await restore(other.page, exported.file);
    const actual = await ledger(other.page);
    assert.deepEqual(actual.docs, exported.data.ledger.docs);
    assert.deepEqual(actual.clients, exported.data.ledger.clients);
    assert.deepEqual(actual.company, companyB);
    assert.deepEqual(
      actual.docs.map((d) => d.currency),
      ["HKD", "USD"],
    );
    assert.ok(
      actual.docs.every((d) => d.issuer.company.nameEn === companyA.nameEn),
    );
    await other.page.locator('[data-tab="備份與匯出"]').click();
    const snapshot = await download(
      other.page,
      other.page.locator('[data-act="pre-import-backup"]'),
    );
    const before = JSON.parse(await fs.readFile(snapshot, "utf8"));
    assert.equal(before.ledger.docs.length, 0);
  },
);
test(
  "two tabs creating simultaneously keep both records with unique PI and contract numbers",
  { timeout: 90000 },
  async (t) => {
    const initial = {
      v: 1,
      clients: fixture.clients,
      docs: [],
      company: companyA,
    };
    const { page, context } = await fresh(t, initial),
      other = await context.newPage();
    // This tab shares the same actual origin and localStorage; fixture initialization is per context below.
    await other.goto(base);
    await other.locator("#newpi").waitFor();
    await Promise.all(
      [page, other].map(async (p) => {
        await p.locator("#newpi").click();
        await p.locator('[name="amount"]').fill("100.00");
      }),
    );
    await Promise.all(
      [page, other].map((p) =>
        p.locator("#form").evaluate((form) => form.requestSubmit()),
      ),
    );
    await settle(
      page,
      (key) => JSON.parse(localStorage.getItem(key)).docs.length === 2,
    );
    const actual = await ledger(page);
    assert.equal(new Set(actual.docs.map((d) => d.pi)).size, 2);
    assert.equal(new Set(actual.docs.map((d) => d.contract)).size, 2);
    assert.ok(actual.docs.every((d) => d.amount === 10000));
  },
);
test(
  "two tabs confirming the same payment retain one invoice and receipt",
  { timeout: 90000 },
  async (t) => {
    const { page, context } = await fresh(t);
    await issue(page);
    await closeModal(page);
    const other = await context.newPage();
    await other.goto(base);
    await Promise.all(
      [page, other].map(async (p) => {
        await p.locator('[data-act="view"]').first().click();
        await p.locator('[data-act="pay"]').click();
      }),
    );
    await Promise.all(
      [page, other].map((p) =>
        p.locator("#form").evaluate((form) => form.requestSubmit()),
      ),
    );
    await settle(
      page,
      (key) =>
        JSON.parse(localStorage.getItem(key)).docs[0].status === "已收款",
    );
    const actual = await ledger(page);
    assert.equal(actual.docs.length, 1);
    assert.ok(actual.docs[0].inv.endsWith("-001"));
    assert.ok(actual.docs[0].rc.endsWith("-001"));
  },
);
test(
  "long names, addresses and service text export on multiple A4 pages without dropped raster rows",
  { timeout: 120000 },
  async (t) => {
    const state = {
      v: 1,
      clients: [
        {
          ...fixture.clients[0],
          name: "示例長名稱".repeat(20),
          en: "FICTIONAL LONG CUSTOMER ".repeat(10),
          address: "Fictional customer address ".repeat(18),
        },
      ],
      docs: [],
      company: {
        ...companyA,
        nameEn: "FICTIONAL LONG ISSUER ".repeat(12).trim(),
        address: "Fictional issuer address ".repeat(12).trim(),
      },
    };
    const { page } = await fresh(t, state);
    await issue(page, {
      item: "長服務描述".repeat(100),
      itemEn:
        "Detailed fictional service line. ".repeat(100) +
        " FINAL CONTENT MARKER",
    });
    const expected = await page.locator(".doc").evaluate(async (doc) => {
      await document.fonts.ready;
      const clone = doc.cloneNode(true),
        shell = document.createElement("div");
      shell.style.cssText =
        "position:absolute;left:-10000px;top:0;width:710px;background:white";
      shell.append(clone);
      document.body.append(shell);
      const height = Math.ceil(shell.getBoundingClientRect().height * 2);
      shell.remove();
      return height;
    });
    assert.ok(
      (await page.locator(".doc").textContent()).includes(
        "FINAL CONTENT MARKER",
      ),
    );
    const pdf = await download(page, page.locator(".pdf-download")),
      pages = await pdfInfo(page, pdf);
    assert.ok(
      pages.length >= 2,
      "Long documents should paginate instead of shrinking everything",
    );
    assert.ok(
      pages.every((p) => p.images.length === 1 && p.images[0].width === 1420),
    );
    const total = pages.reduce((n, p) => n + p.images[0].height, 0);
    assert.ok(
      Math.abs(total - expected) <= 2,
      `Expected ${expected} raster rows, got ${total}`,
    );
    assert.ok(
      pages.every(
        (p) =>
          (p.images[0].height * 520) / 1420 <= 767 && p.size.height === 841.89,
      ),
    );
  },
);
test(
  "legacy upgrade pins available company before settings change and preserves original bytes",
  { timeout: 90000 },
  async (t) => {
    const { page } = await fresh(t, { ...fixture, company: companyA });
    await page.waitForFunction(
      (key) => !!JSON.parse(localStorage.getItem(key)).docs[0].issuer,
      key,
    );
    await settings(page, companyB);
    const actual = await ledger(page);
    assert.equal(actual.docs[0].issuer.company.nameEn, companyA.nameEn);
    assert.equal(actual.docs[0].issuer.source, "legacy-baseline");
    await page.locator('[data-act="view"]').first().click();
    assert.ok(
      (await page.locator(".history-notice").textContent()).includes(
        "Legacy document",
      ),
    );
    const raw = await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key + "-before-snapshots")),
      key,
    );
    assert.equal(raw.docs[0].issuer, undefined);
  },
);
test(
  "single-file offline build can create and preserve a snapshot",
  { timeout: 90000 },
  async (t) => {
    const { page } = await fresh(t, undefined, "/Billing-Workspace.html");
    const doc = await issue(page);
    assert.equal(doc.issuer.source, "issued");
    assert.equal(doc.issuer.company.nameEn, companyA.nameEn);
  },
);
