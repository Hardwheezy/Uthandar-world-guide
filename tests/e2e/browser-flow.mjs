/**
 * Optional browser walkthrough of the definition of done (needs Chrome installed).
 *   1. npm run dev   (or npm run build && npm start)
 *   2. npm run test:e2e
 * Env: BASE_URL, CHROME_PATH, SHOTS_DIR (optional screenshots), SEED_DM_EMAIL / SEED_DM_PASSWORD.
 * Creates "Browser Test Ford", checks visitor / preview / DM views, then deletes it
 * (it stays restorable under "Recently deleted" in the DM Ledger).
 */
import puppeteer from "puppeteer-core";
import fs from "node:fs";
const base = process.env.BASE_URL ?? "http://localhost:3000";
const shots = process.env.SHOTS_DIR ?? null;
const chrome =
  process.env.CHROME_PATH ??
  [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ].find((p) => fs.existsSync(p));
if (!chrome) {
  console.error("Chrome not found. Set CHROME_PATH to your Chrome or Edge executable.");
  process.exit(1);
}
const shot = async (p, name) => {
  if (shots) await p.screenshot({ path: `${shots}/${name}`, fullPage: true });
};
const CANARY = "BROWSERCANARY";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: chrome, args: ["--no-sandbox"], headless: true });
const fail = (m) => { console.error("FAIL:", m); process.exitCode = 1; };
const page = await browser.newPage();
page.on("pageerror", (e) => console.error("pageerror:", e.message));
page.on("console", (m) => { if (m.type() === "error") console.error("console:", m.text()); });
await page.setViewport({ width: 1366, height: 900 });

// 1. sign in
await page.goto(base + "/login?next=/new?template=place", { waitUntil: "networkidle0" });
await page.type('input[name="email"]', process.env.SEED_DM_EMAIL ?? "dm@uthandar.local");
await page.type('input[name="password"]', process.env.SEED_DM_PASSWORD ?? "change-me-before-sharing");
await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0" }), page.click('button[type="submit"]')]);
console.log("at", page.url());
// Remove leftovers from an earlier interrupted run so the slug is predictable.
await page.evaluate(async () => {
  for (const slug of ["browser-test-ford", "browser-test-ford-2", "browser-test-ford-3"]) {
    const a = await (await fetch("/api/articles/" + slug)).json();
    if (a.article) await fetch("/api/articles/" + a.article.id, { method: "DELETE" });
  }
});
await page.reload({ waitUntil: "networkidle0" });

// 2. new entry from the place template
await page.waitForSelector("#ed-title");
await page.type("#ed-title", "Browser Test Ford");
await page.waitForSelector(".rt-content");
const editors = await page.$$(".rt-content");
await editors[0].click();
await page.keyboard.type("Travellers cross here on the way to ");
await page.keyboard.type("[[Tallw");
await page.waitForSelector(".wl-popup .wl-item", { timeout: 5000 });
const popupText = await page.$eval(".wl-popup", (e) => e.textContent);
console.log("popup:", popupText);
await page.keyboard.press("Enter");
await sleep(200);
await page.keyboard.type("and beyond.");
const wl = await page.$$eval(".rt-content .wl", (els) => els.map((e) => e.textContent));
console.log("wiki links in editor:", wl);
if (!wl.includes("Tallwater")) fail("wiki link not inserted");

// 3. publish the entry to the guide, and add a DM Ledger section
await page.evaluate(() => {
  const card = [...document.querySelectorAll(".side-card")].find((c) => c.textContent.includes("Who can read this entry"));
  [...card.querySelectorAll('button[role="radio"]')].find((b) => b.textContent === "Guide").click();
});
await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent === "Add DM Ledger section").click());
await sleep(300);
const headings = await page.$$(".ed-heading");
await headings[headings.length - 1].type("The ferryman's arrangement");
const eds = await page.$$(".rt-content");
await eds[eds.length - 1].click();
await page.keyboard.type(`${CANARY} the ferryman reports to `);
await page.keyboard.type("[[Harl");
await page.waitForSelector(".wl-popup .wl-item");
await page.keyboard.press("Enter");
await sleep(200);
await shot(page, "e2e-editor.png");

// 4. save (stays in editor), then save and view
await page.keyboard.down("Control"); await page.keyboard.press("s"); await page.keyboard.up("Control");
await page.waitForFunction(() => document.querySelector(".editor-state")?.textContent?.includes("Saved"), { timeout: 10000 });
await sleep(800);
console.log("after ctrl+s:", page.url());
await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0" }).catch(() => {}), page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent === "Save and view").click())]);
await sleep(500);
console.log("after save and view:", page.url());
if (!page.url().endsWith("/a/browser-test-ford")) fail("did not land on article");
const dmHtml = await page.content();
if (!dmHtml.includes(CANARY)) fail("DM cannot see DM section");
if (!(await page.$('a[href="/a/tallwater"]'))) fail("no link to Tallwater");
await shot(page, "e2e-article-dm.png");

// 5. public preview
await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0" }), page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent === "View as visitor").click())]);
await sleep(800);
await page.waitForSelector(".graph-node", { timeout: 8000 });
await sleep(500);
const prevNodes = await page.$$eval(".graph-node", (els) => els.map((e) => e.textContent));
console.log("preview graph nodes:", prevNodes);
if (prevNodes.some((t) => t.includes("Harlan"))) fail("DM-only mention edge to Harlan shown in public preview graph");
const prevHtml = await page.content();
console.log("preview banner:", prevHtml.includes("Public preview"));
if (prevHtml.includes(CANARY)) fail("canary visible in public preview (HTML/RSC)");
await shot(page, "e2e-article-preview.png");
await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0" }), page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent === "Return to DM view").click())]);

// 6. anonymous visitor in a fresh context
const ctx = await browser.createBrowserContext();
const anon = await ctx.newPage();
await anon.setViewport({ width: 1366, height: 900 });
await anon.goto(base + "/a/browser-test-ford", { waitUntil: "networkidle0" });
await sleep(800);
const anonHtml = await anon.content();
if (anonHtml.includes(CANARY)) fail("canary visible to anonymous visitor");
if (anonHtml.includes("ferryman")) fail("DM heading visible to anonymous visitor");
await anon.waitForSelector(".graph-node", { timeout: 8000 });
const anonNodes = await anon.$$eval(".graph-node", (els) => els.map((e) => e.textContent));
console.log("anon graph nodes:", anonNodes);
if (anonNodes.some((t) => t.includes("Harlan"))) fail("DM mention edge visible to anonymous visitor");
// and the DM view DOES show it (positive control)
await page.goto(base + "/a/browser-test-ford", { waitUntil: "networkidle0" });
await page.waitForSelector(".graph-node");
await sleep(500);
const dmNodes = await page.$$eval(".graph-node", (els) => els.map((e) => e.textContent));
if (!dmNodes.some((t) => t.includes("Harlan"))) fail("positive control: DM should see the Harlan mention");
await anon.goto(base + "/a/tallwater", { waitUntil: "networkidle0" });
const mentioned = await anon.$$eval(".explore-grid a", (as) => as.map((a) => a.textContent));
console.log("Tallwater mentioned-in/related (anon):", mentioned);
if (!mentioned.includes("Browser Test Ford")) fail("backlink missing for visitor");
await anon.goto(base + "/a/harlan", { waitUntil: "networkidle0" });
const harlanAnon = await anon.$$eval(".explore-grid a", (as) => as.map((a) => a.textContent));
if (harlanAnon.includes("Browser Test Ford")) fail("DM-only backlink leaked to Harlan for visitor");
await anon.goto(base + "/search?q=ferryman", { waitUntil: "networkidle0" });
if ((await anon.content()).includes("Browser Test Ford")) fail("search leaked DM text");
// clean up: delete the test entry (restorable from the Ledger)
const del = await page.evaluate(async () => {
  const a = await (await fetch("/api/articles/browser-test-ford")).json();
  return a.article ? (await fetch("/api/articles/" + a.article.id, { method: "DELETE" })).status : "missing";
});
console.log("cleanup:", del);
console.log(process.exitCode ? "E2E FAILED" : "E2E OK");
await browser.close();
