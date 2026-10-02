// Runs the diagram editor in headless Chrome with the mocked VS Code API and saves screenshots.
// Usage: node build.mjs --harness && node test/harness/shots.mjs <model.opm.json> <output dir>
import { createServer } from "http";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { extname, join, resolve } from "path";
import puppeteer from "puppeteer-core";

const [modelPath = "examples/window-pricing/model.opm.json", out = "shots"] = process.argv.slice(2);
const root = resolve(".");
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };
mkdirSync(out, { recursive: true });

const server = createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  let body;
  try {
    body = readFileSync(join(root, url.pathname));
  } catch {
    res.writeHead(404).end();
    return;
  }
  if (url.pathname === "/test/harness/index.html") {
    body = body.toString().replace("__MODEL__", readFileSync(modelPath, "utf-8").replace(/</g, "\u003c"));
  }
  res.writeHead(200, { "content-type": types[extname(url.pathname)] ?? "application/octet-stream" }).end(body);
});
await new Promise((r) => server.listen(0, r));
const base = `http://localhost:${server.address().port}/test/harness/index.html`;

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  args: ["--no-sandbox"],
});
const errors = [];
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 860 });
page.on("console", (m) => {
  // the browser reports the missing favicon as a console error
  if ((m.type() === "error" || m.type() === "warning") && !m.text().startsWith("Failed to load resource")) errors.push(`${m.type()}: ${m.text()}`);
});
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("response", (r) => { if (r.status() >= 400 && !r.url().endsWith("/favicon.ico")) errors.push(`http ${r.status()}: ${r.url()}`); });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (name) => { await wait(700); await page.screenshot({ path: join(out, `${name}.png`) }); console.log("shot", name); };
const box = async (selector) => {
  const el = await page.waitForSelector(selector, { timeout: 5000 });
  return el.boundingBox();
};
const clickThing = async (id, dy = 0.3) => {
  const b = await box(`[data-thing="${id}"]`);
  await page.mouse.click(b.x + b.width / 2, b.y + b.height * dy);
};
const rightClickThing = async (id, dy = 0.3) => {
  const b = await box(`[data-thing="${id}"]`);
  await page.mouse.click(b.x + b.width / 2, b.y + b.height * dy, { button: "right" });
};
const pick = async (label) => {
  await page.waitForSelector(".opm-context", { timeout: 2000 });
  const item = await page.evaluateHandle((l) => [...document.querySelectorAll(".opm-context button")].find((b) => b.firstChild?.textContent === l), label);
  await item.asElement().click();
};
const menuTitle = () => page.evaluate(() => document.querySelector(".opm-context .opm-context-head b")?.textContent ?? null);
const check = (name, ok, detail = "") => console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `: ${detail}` : ""}`);
const text = () => page.evaluate(() => window.harness.text);

async function scenario(lang, theme) {
  await page.goto(`${base}?lang=${lang}`);
  await page.evaluate((t) => { document.body.className = t; }, theme);
  await page.waitForSelector(".react-flow__node", { timeout: 10000 });
  await wait(800);
}

await scenario("en", "vscode-dark");
await shot("01-system");

// the right button pans and opens the menu only without movement; the left button draws a selection rectangle
{
  const transform = () => page.evaluate(() => document.querySelector(".react-flow__viewport").style.transform);
  const spot = await page.evaluate(() => {
    for (let y = 120; y < 700; y += 20) for (let x = 40; x < 900; x += 20) {
      if (document.elementFromPoint(x, y)?.classList.contains("react-flow__pane")) return { x, y };
    }
    return null;
  });
  const before = await transform();
  await page.mouse.move(spot.x, spot.y);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(spot.x + 60, spot.y + 40, { steps: 6 });
  await page.mouse.up({ button: "right" });
  await wait(200);
  const panned = (await transform()) !== before;
  const menuAfterPan = await page.evaluate(() => !!document.querySelector(".opm-context"));
  check("right drag pans", panned && !menuAfterPan, `moved: ${panned}, menu: ${menuAfterPan}`);
  await page.mouse.click(spot.x, spot.y, { button: "right" });
  await wait(100);
  const paneItems = await page.evaluate(() => [...document.querySelectorAll(".opm-context button")].length);
  check("right click on the pane", paneItems === 3, `${paneItems} items`);
  await page.keyboard.press("Escape");
  const pane = await box(".react-flow__pane");
  await page.mouse.move(pane.x + 5, pane.y + 60);
  await page.mouse.down();
  await page.mouse.move(pane.x + pane.width / 2, pane.y + pane.height / 2, { steps: 10 });
  await page.screenshot({ path: join(out, "01b-selection-rectangle.png") });
  await page.mouse.up();
  await wait(200);
  const selected = await page.evaluate(() => document.querySelectorAll(".react-flow__node.selected").length);
  check("selection rectangle", selected > 0, `${selected} selected`);
  await page.keyboard.press("Escape");
}

await clickThing("snapshot", 0.2);
await shot("02-selected-object");

await rightClickThing("snapshot", 0.6);
check("context menu on a thing", (await menuTitle()) === "Snapshot", await menuTitle());
await shot("02b-context-menu");
await pick("Properties");
await shot("03-drawer");

// a note is written as Markdown and shown with clickable links
{
  await page.click(".opm-drawer .opm-note-input");
  await page.keyboard.type("Frozen copy, see [spec](docs/spec.md) and https://example.com/a");
  await page.click(".opm-drawer .opm-insp-head b");
  await wait(400);
  const note = JSON.parse(await text()).objects.snapshot.note;
  const links = await page.evaluate(() => [...document.querySelectorAll(".opm-drawer .opm-note a")].map((a) => a.getAttribute("href")));
  check("note", note?.startsWith("Frozen copy") && links.join(" ") === "docs/spec.md https://example.com/a", `${note} | ${links.join(" ")}`);
  await page.click(".opm-drawer .opm-note a");
  await wait(100);
  const sent = await page.evaluate(() => window.harness.messages.filter((m) => m.type === "openLink").map((m) => m.href));
  check("note link", sent[0] === "docs/spec.md", sent.join(", "));
  await shot("03b-note");
}

await page.click(".opm-opl-toggle");
await shot("04-opl-expanded");

// splitters resize the drawer and the OPL panel
{
  const drag = async (selector, dx, dy) => {
    const b = await box(selector);
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2 + dx, b.y + b.height / 2 + dy, { steps: 6 });
    await page.mouse.up();
  };
  const width = () => page.evaluate(() => document.querySelector(".opm-drawer-pane").getBoundingClientRect().width);
  const height = () => page.evaluate(() => document.querySelector(".opm-opl").getBoundingClientRect().height);
  const w0 = await width(), h0 = await height();
  await drag(".opm-splitter.vertical", -100, 0);
  await drag(".opm-splitter.horizontal", 0, -60);
  const w1 = await width(), h1 = await height();
  check("splitters", Math.round(w1 - w0) === 100 && Math.round(h1 - h0) === 60, `drawer ${w0} → ${w1}, OPL ${h0} → ${h1}`);
  await shot("04b-resized");
}
await page.click(".opm-opl-toggle");
await page.click(".opm-drawer .opm-insp-head button");
await page.keyboard.press("Escape");

// link drawing: from the right handle of "user" onto "pricing"
{
  await clickThing("user", 0.5);
  await page.keyboard.press("Escape");
  const u = await box('.react-flow__node[data-id="user"]');
  await page.mouse.move(u.x + u.width / 2, u.y + u.height / 2);
  const h = await box('.react-flow__node[data-id="user"] .react-flow__handle-right');
  const p = await box('[data-thing="pricing"]');
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move((h.x + p.x) / 2, (h.y + p.y) / 2, { steps: 8 });
  await shot("05-drawing-link");
  await page.mouse.move(p.x + p.width / 2, p.y + p.height / 2, { steps: 8 });
  await page.mouse.up();
  await shot("06-link-menu");
  await page.keyboard.press("1");
  await wait(300);
  console.log("after link:", JSON.stringify(JSON.parse(await text()).processes.pricing.requires ?? JSON.parse(await text()).processes.pricing));
}

// the first move saves the positions of the whole view
{
  const g = await box('[data-thing="generator"]');
  await page.mouse.move(g.x + g.width / 2, g.y + 10);
  await page.mouse.down();
  await page.mouse.move(g.x + g.width / 2 + 60, g.y + 70, { steps: 10 });
  await page.mouse.up();
  await shot("07-first-move");
  const layout = JSON.parse(await text()).layout;
  console.log("layout views:", Object.keys(layout ?? {}), "entries:", Object.keys(layout?.system ?? {}).length);
}

// zoom view of configuring: double click on the process
{
  const c = await box('[data-thing="configuring"]');
  await page.mouse.click(c.x + c.width * 0.75, c.y + c.height * 0.7, { clickCount: 2 });
  await wait(900);
  await shot("08-zoom");
}

// a new process inside the zoom, then its label typed in place
{
  await page.keyboard.press("p");
  await wait(600);
  await page.keyboard.type("Checking Stock");
  await page.keyboard.press("Enter");
  await wait(600);
  await shot("09-new-subprocess");
  const m = JSON.parse(await text());
  console.log("zoomsInto:", m.processes.configuring.zoomsInto, "has checkingStock:", !!m.processes.checkingStock);
}

const model = async () => JSON.parse(await text());

// link labels: switched on from the menu, drawn in the label layer
{
  await page.click(".opm-more");
  const toggle = await page.evaluateHandle(() => [...document.querySelectorAll(".opm-menu button")].find((b) => b.textContent.includes("Link labels")));
  await toggle.asElement().click();
  await wait(300);
  const n = await page.evaluate(() => document.querySelectorAll(".react-flow__edgelabel-renderer .opm-edge-label").length);
  check("link labels", n > 5, `${n} labels`);
  await shot("08b-link-labels");
  await page.click(".opm-more");
  const off = await page.evaluateHandle(() => [...document.querySelectorAll(".opm-menu button")].find((b) => b.textContent.includes("Link labels")));
  await off.asElement().click();
}

// a vertical drag of a subprocess changes the order of execution
{
  const a = await box('[data-thing="checkingStock"]');
  const p = await box('[data-thing="proposing"]');
  await page.mouse.move(a.x + 30, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + 30, p.y + 5, { steps: 12 });
  await page.mouse.up();
  await wait(500);
  const order = (await model()).processes.configuring.zoomsInto;
  check("reorder subprocess", order[0] === "checkingStock", order.join(", "));
}

// the right button on a link opens its menu
async function clickEdge(id, button = "left") {
  const pt = await page.evaluate((edgeId) => {
    const paths = document.querySelectorAll(`[data-edge="${edgeId}"] .react-flow__edge-interaction`);
    const path = paths[paths.length - 1];
    if (!path) return null;
    const p = path.getPointAtLength(path.getTotalLength() / 2);
    const m = path.getScreenCTM();
    return { x: p.x * m.a + p.y * m.c + m.e, y: p.x * m.b + p.y * m.d + m.f };
  }, id);
  if (pt) {
    const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest("[data-edge]")?.getAttribute("data-edge"), pt);
    if (hit !== id) {
      console.log("edge click lands on", hit, "at", JSON.stringify(pt));
      console.log(await page.evaluate(() => [...document.querySelectorAll('[data-edge*="applying/c"] .react-flow__edge-interaction')]
        .map((p) => `${p.closest("[data-edge]").getAttribute("data-edge")} ${p.getAttribute("d")}`).join(" | ")));
    }
    await page.mouse.click(pt.x, pt.y, { button });
  }
  return !!pt;
}
{
  const found = await clickEdge("processes/applying/changes/0", "right");
  await wait(300);
  const head = await menuTitle();
  check("link menu", found && head === "changes", head ?? "no menu");
  await shot("12-link-menu");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Delete");
  await wait(300);
  check("delete link", !(await model()).processes.applying.changes, JSON.stringify((await model()).processes.applying.changes));
  await page.evaluate(() => window.harness.undo());
  await wait(300);
  check("undo restores", !!(await model()).processes.applying.changes);
}

// copy and paste through clipboard events
{
  await clickThing("generator", 0.5);
  const pasted = await page.evaluate(async () => {
    const data = new DataTransfer();
    document.dispatchEvent(new ClipboardEvent("copy", { clipboardData: data, bubbles: true, cancelable: true }));
    const copied = data.getData("text/plain");
    document.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 300));
    return copied.length;
  });
  const m = await model();
  check("copy and paste", pasted > 0 && !!m.objects.generator2, Object.keys(m.objects).filter((k) => k.startsWith("generator")).join(", "));
}

// F2 opens the drawer with the identifier field; the rename updates references
{
  await page.keyboard.press("Escape");
  await clickThing("decision", 0.2);
  await page.keyboard.press("F2");
  await wait(200);
  await page.keyboard.type("verdict");
  await page.keyboard.press("Enter");
  await wait(400);
  const m = await model();
  check("rename with F2", !!m.objects.verdict && !m.objects.decision && JSON.stringify(m).includes('"verdict"'), Object.keys(m.objects).includes("verdict") ? "" : "not renamed");
  await shot("13-drawer-after-rename");
  await page.click(".opm-drawer .opm-insp-head button");
}

// export
{
  await page.keyboard.press("Escape");
  await page.click(".opm-trail button.link");
  await wait(800);
  await page.click(".opm-more");
  await page.click(".opm-menu button:first-child");
  await wait(1500);
  const exported = await page.evaluate(() => window.harness.messages.filter((m) => m.type === "export").map((m) => m.data.slice(0, 22)));
  check("export png", exported[0] === "data:image/png;base64,", exported[0]);
}

// every layout algorithm writes positions for the view
for (const [i, name] of ["Layers, left to right", "Layers, top to bottom", "Stress: distances follow the links", "Force-directed", "Tree", "Radial", "Compact block, links ignored"].entries()) {
  await page.click(".opm-layout");
  if (i === 0) await shot("15-layout-menu");
  const item = await page.evaluateHandle((n) => [...document.querySelectorAll(".opm-layout-menu button")].find((b) => b.textContent === n), name);
  await item.asElement().click();
  await wait(1500);
  const layout = (await model()).layout?.system ?? {};
  const xs = Object.values(layout).map((p) => p[0]);
  const distinct = new Set(Object.values(layout).map((p) => p.join(","))).size;
  check(`layout ${name}`, distinct === Object.keys(layout).length && distinct > 10 && Math.min(...xs) >= 0, `${distinct} distinct positions`);
  await shot(`15-layout-${i}`);
}
{
  await page.click(".opm-more");
  const item = await page.evaluateHandle(() => [...document.querySelectorAll(".opm-menu button")].find((b) => b.textContent === "Create JSON Schema"));
  await item.asElement().click();
  await wait(200);
  check("create schema message", await page.evaluate(() => window.harness.messages.some((m) => m.type === "createSchema")));
}

// Polish UI, light theme, a parse error banner
await scenario("pl", "vscode-light");
await clickThing("decision", 0.2);
await shot("10-light-pl");
await page.evaluate(() => window.harness.setText(window.harness.text.replace('"objects": {', '"objects": {,')));
await wait(500);
await shot("11-parse-error");

writeFileSync(join(out, "console.txt"), errors.join("\n"));
console.log(errors.length ? `console: ${errors.length} message(s)\n${errors.slice(0, 20).join("\n")}` : "console: clean");
await browser.close();
server.close();
