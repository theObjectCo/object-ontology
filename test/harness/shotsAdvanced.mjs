export async function runAdvancedScenarios(ctx) {
  const { page, wait, shot, clickThing, menuTitle, check, model, scenario, openStory } = ctx;

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

  // the views of other methods: opened from the ⋯ menu, drawn over the diagram, redrawn on a text change, closed with Esc
  {
    await scenario("en", "vscode-dark");
    const methodText = () => page.evaluate(() => document.querySelector(".opm-method-body")?.textContent ?? "");
    const tab = async (name) => {
      const b = await page.evaluateHandle((n) => [...document.querySelectorAll(".opm-method-head .opm-seg button")].find((x) => x.textContent === n), name);
      await b.asElement().click();
      await wait(200);
    };
    await page.click(".opm-more");
    const item = await page.evaluateHandle(() => [...document.querySelectorAll(".opm-menu button")].find((b) => b.textContent === "View as IDEF0"));
    await item.asElement().click();
    await page.waitForSelector(".opm-method", { timeout: 2000 });
    const boxes = await page.evaluate(() => document.querySelectorAll(".opm-m-box").length);
    check("IDEF0 of Configuring: A-0 and three subprocess boxes", boxes === 4, `${boxes} boxes`);
    await shot("16-idef0");
    await page.evaluate(() => document.querySelectorAll(".opm-method-body h3")[1].scrollIntoView());
    await shot("16a-idef0-decomposition");
    await page.evaluate(() => document.querySelector(".opm-method-body").scrollTo(0, 0));
    await page.select(".opm-method-head select", "pricing");
    await shot("16b-idef0-pricing");
    await tab("SIPOC");
    await page.select(".opm-method-head select", "pricing");
    const rows = await page.evaluate(() => document.querySelectorAll(".opm-m-sipoc tbody tr").length);
    check("SIPOC of Pricing", rows === 5, `${rows} rows`);
    await shot("17-sipoc");
    await tab("N² matrix");
    const filled = await page.evaluate(() => document.querySelectorAll(".opm-m-dsm td.filled").length);
    check("N² matrix", filled === 4, `${filled} filled cells`);
    await shot("18-dsm");
    await tab("Process flow");
    const activities = await page.evaluate(() => document.querySelectorAll(".opm-m-activity").length);
    check("process flow of Configuring", activities === 3, `${activities} activities`);
    await shot("19-flow");
    await page.evaluate(() => window.harness.setText(window.harness.text.replace('"generator": { "role": "module" }', '"generator": { "role": "module", "label": "Rule Engine" }')));
    await wait(500);
    check("a text change redraws the method view", (await methodText()).includes("Rule Engine"));
    await page.keyboard.press("Escape");
    await wait(200);
    check("Esc closes the method view", !(await page.evaluate(() => !!document.querySelector(".opm-method"))));
    await scenario("pl", "vscode-light");
    await page.click(".opm-more");
    const pl = await page.evaluateHandle(() => [...document.querySelectorAll(".opm-menu button")].find((b) => b.textContent === "Widok IDEF0"));
    await pl.asElement().click();
    await page.waitForSelector(".opm-method", { timeout: 2000 });
    await shot("20-idef0-light-pl");
  }

  // Polish UI, light theme, a parse error banner
  await scenario("pl", "vscode-light");
  await clickThing("decision", 0.2);
  await shot("10-light-pl");
  await openStory("changeWindow");
  await page.waitForSelector(".opm-story", { timeout: 3000 });
  await shot("10b-makigami-light-pl");
  await page.keyboard.press("Escape");
  await page.evaluate(() => window.harness.setText(window.harness.text.replace('"objects": {', '"objects": {,')));
  await wait(500);
  await shot("11-parse-error");
}
