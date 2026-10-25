import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { Model } from "../src/core/model";
import { TOOLS, callTool } from "../src/mcp/tools";

/** A fresh copy of the example model, with its JSON Schema file beside it, in its own temp folder. */
function copy(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "opm-mcp-"));
  for (const f of ["model.opm.json", "contracts.schema.json"]) fs.copyFileSync(path.join("examples/window-pricing", f), path.join(dir, f));
  return path.join(dir, "model.opm.json");
}

const text = (name: string, args: Record<string, unknown>) => {
  const r = callTool(name, args);
  assert.ok(!r.isError, `${name} failed: ${r.content[0].text}`);
  return r.content[0].text;
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const json = (name: string, args: Record<string, unknown>): any => JSON.parse(text(name, args));
const refused = (name: string, args: Record<string, unknown>) => {
  const r = callTool(name, args);
  assert.equal(r.isError, true, `${name} should be refused, got: ${r.content[0].text.slice(0, 200)}`);
  return r.content[0].text;
};
const model = (file: string) => JSON.parse(fs.readFileSync(file, "utf-8")) as Model;
const changedLines = (a: string, b: string) => {
  const la = new Set(a.split("\n")), lb = new Set(b.split("\n"));
  return [...lb].filter((l) => !la.has(l)).length + [...la].filter((l) => !lb.has(l)).length;
};

test("every tool has a prefixed name, a description with an example and an object schema", () => {
  for (const t of TOOLS) {
    assert.match(t.name, /^opm_[a-z_]+$/);
    assert.ok(t.description.includes("Example"), `${t.name} has no example`);
    assert.equal(t.inputSchema.type, "object");
  }
  assert.equal(TOOLS.length, 18);
});

test("opm_list_models finds models under a folder and skips node_modules", () => {
  const file = copy();
  const dir = path.dirname(file);
  fs.mkdirSync(path.join(dir, "node_modules"));
  fs.copyFileSync(file, path.join(dir, "node_modules", "hidden.opm.json"));
  fs.writeFileSync(path.join(dir, "broken.opm.json"), "{ nope");
  const list = json("opm_list_models", { root: dir });
  assert.equal(list.length, 2);
  const m = list.find((x: { path: string }) => x.path === file);
  assert.deepEqual([m.name, m.processes, m.modules, m.agents, m.stories, m.errors], ["Window configuration and pricing", 11, 5, 1, 3, 0]);
  assert.equal(list.find((x: { path: string }) => x.path.endsWith("broken.opm.json")).error, "not valid JSON");
  refused("opm_list_models", { root: "relative/folder" });
});

test("opm_validate returns structured diagnostics with positions", () => {
  const file = copy();
  assert.equal(json("opm_validate", { path: file }).errors, 0);
  fs.writeFileSync(file, fs.readFileSync(file, "utf-8").replace('"requires": ["pricingModule", "snapshot"', '"requires": ["pricingModul", "snapshot"'));
  const r = json("opm_validate", { path: file });
  assert.match(r.summary, /^1 error/);
  const d = r.diagnostics.find((x: { severity: string }) => x.severity === "error");
  assert.deepEqual([d.code, d.path, d.element], ["unknown-object", ["processes", "pricing", "requires", 0], "pricing"]);
  assert.ok(d.line > 1 && d.column > 1);
});

test("opm_summary lists agents, modules, objects, the zoom tree, views and stories", () => {
  const s = json("opm_summary", { path: copy() });
  assert.deepEqual(s.agents.map((a: { id: string }) => a.id), ["user"]);
  assert.ok(s.modules.some((m: { id: string }) => m.id === "pricingModule"));
  assert.deepEqual(s.objects.find((o: { id: string }) => o.id === "snapshot").states, ["valid", "expired"]);
  const configuring = s.processes.find((p: { id: string }) => p.id === "configuring");
  assert.deepEqual(configuring.subprocesses.map((p: { id: string }) => p.id), ["proposing", "validating", "applying"]);
  assert.ok(!s.processes.some((p: { id: string }) => p.id === "proposing"), "a subprocess is only listed under its parent");
  assert.ok(s.views.some((v: { id: string; code: string }) => v.id === "pricing" && v.code.startsWith("SD")));
  assert.deepEqual(s.stories.map((x: { id: string }) => x.id), ["changeWindow", "getPrice", "expireSnapshot"]);
});

test("opm_get gives a thing with its links in both directions and its stories", () => {
  const file = copy();
  const snap = json("opm_get", { path: file, id: "snapshot" });
  assert.equal(snap.kind, "object");
  assert.deepEqual(snap.outgoing.map((l: { kind: string; target: string }) => `${l.kind} ${l.target}`), ["consistsOf bom", "consistsOf costDrivers", "exhibits hash"]);
  assert.ok(snap.incoming.some((l: { kind: string; owner: string }) => l.kind === "yields" && l.owner === "freezing"));
  assert.ok(snap.incoming.some((l: { kind: string; owner: string; fromState: string; toState: string }) => l.kind === "changes" && l.owner === "expiring" && l.fromState === "valid" && l.toState === "expired"));
  assert.ok(snap.incoming.some((l: { kind: string; state: string }) => l.kind === "conditions" && l.state === "valid"));
  assert.ok(snap.stories.some((u: { story: string; as: string }) => u.story === "getPrice" && u.as === "handed over"));
  assert.ok(snap.opl.some((s: string) => s.startsWith("Snapshot can be")));

  const pricing = json("opm_get", { path: file, id: "pricing" });
  assert.equal(pricing.parent, null);
  assert.deepEqual(pricing.subprocesses, ["productPricing", "transportPricing", "leadTimeEstimating"]);
  assert.ok(pricing.outgoing.some((l: { kind: string; target: string }) => l.kind === "consumes" && l.target === "priceRequest"));
  assert.equal(json("opm_get", { path: file, id: "productPricing" }).parent, "pricing");
  assert.equal(json("opm_get", { path: file, id: "pricingModule" }).kind, "module");

  assert.equal(json("opm_get", { path: file, id: "getPrice" }).kind, "story");
  assert.match(refused("opm_get", { path: file, id: "price" }), /Did you mean: .*priceRequest/);
});

test("opm_query answers the four questions", () => {
  const file = copy();
  const mods = json("opm_query", { path: file, question: "modulesOfProcess", process: "configuring" });
  assert.deepEqual(mods.modules.map((m: { id: string }) => m.id), ["ui", "generator"]);
  assert.deepEqual(mods.modules.find((m: { id: string }) => m.id === "generator").requiredBy, ["validating", "applying"]);

  const procs = json("opm_query", { path: file, question: "processesOfObject", object: "decision" });
  assert.deepEqual(procs.links.map((l: { process: string; kind: string }) => `${l.process} ${l.kind}`), ["validating yields", "applying changes", "applying conditions"]);

  const ex = json("opm_query", { path: file, question: "exchange", from: "generator", to: "pricingModule" });
  assert.ok(ex.objects.some((o: { id: string; via: { giver: string; taker: string }[] }) => o.id === "snapshot" && o.via.some((v) => v.giver === "freezing" && v.taker === "pricing")));
  refused("opm_query", { path: file, question: "exchange", from: "snapshot", to: "pricingModule" });

  const lanes = json("opm_query", { path: file, question: "storyLanes", story: "getPrice" });
  assert.deepEqual(lanes.lanes.map((l: { id: string; kind: string }) => `${l.id}:${l.kind}`), ["user:agent", "generator:module", "snapshotStore:module", "pricingModule:module"]);
  assert.deepEqual(lanes.lanes[3].receives, [{ step: 2, object: "snapshot", state: "valid", from: "snapshotStore" }]);

  refused("opm_query", { path: file, question: "modulesOfProcess" });
});

test("opm_opl, opm_render and opm_method return text and write only when asked", () => {
  const file = copy();
  const all = text("opm_opl", { path: file }).split("\n");
  const some = text("opm_opl", { path: file, ids: ["expiring"] }).split("\n");
  assert.ok(some.length < all.length && some.includes("Expiring changes Snapshot from valid to expired."));

  const doc = text("opm_render", { path: file, methods: [] });
  assert.ok(doc.startsWith("# Window configuration and pricing") && !doc.includes("## IDEF0"));
  assert.ok(text("opm_render", { path: file, methods: ["sipoc"] }).includes("## SIPOC"));
  const md = file.replace(/\.opm\.json$/, ".md");
  assert.ok(!fs.existsSync(md), "render without write leaves no file");
  assert.match(text("opm_render", { path: file, write: true }), /Written .*model\.md/);
  assert.ok(fs.readFileSync(md, "utf-8").includes("## Process flow"));

  assert.ok(text("opm_method", { path: file, method: "idef0", process: "pricing" }).includes("### A-0 Pricing"));
  assert.ok(text("opm_method", { path: file, method: "dsm" }).includes("N²"));
  refused("opm_method", { path: file, method: "bpmn" });
});

test("opm_add_object and opm_add_process write minimal edits and report what they introduced", () => {
  const file = copy();
  const before = fs.readFileSync(file, "utf-8");
  const r = json("opm_add_object", { path: file, id: "invoice", states: ["draft", "sent"], description: "The bill for an order." });
  assert.deepEqual([r.changed, r.ids], [true, ["invoice"]]);
  assert.deepEqual(model(file).objects!.invoice, { description: "The bill for an order.", states: ["draft", "sent"] });
  assert.ok(changedLines(before, fs.readFileSync(file, "utf-8")) <= 3, "one new line and the comma before it");
  assert.ok(r.introduced.some((d: { element: string; severity: string }) => d.element === "invoice" && d.severity === "warning"));

  json("opm_add_object", { path: file, label: "Sales Manager", essence: "physical" });
  assert.deepEqual(model(file).objects!.salesManager, { essence: "physical" });
  json("opm_add_object", { path: file, id: "erpLink", label: "ERP link" });
  assert.equal(model(file).objects!.erpLink.label, "ERP link");
  assert.match(refused("opm_add_object", { path: file, id: "invoice" }), /already used/);
  assert.match(refused("opm_add_object", { path: file, id: "Bad id" }), /not a valid identifier/);

  const p = json("opm_add_process", { path: file, id: "discounting", parent: "pricing", index: 1 });
  assert.deepEqual(model(file).processes!.pricing.zoomsInto, ["productPricing", "discounting", "transportPricing", "leadTimeEstimating"]);
  assert.ok(p.introduced.some((d: { element: string; severity: string }) => d.element === "discounting" && d.severity === "error"), "a process that transforms nothing is an error");
});

test("opm_link stores every kind in its field, with states, tags and notes, and refuses wrong ends", () => {
  const file = copy();
  json("opm_add_object", { path: file, id: "invoice", states: ["draft", "sent"] });
  json("opm_add_process", { path: file, id: "invoicing" });
  json("opm_link", { path: file, kind: "handledBy", owner: "invoicing", target: "user" });
  json("opm_link", { path: file, kind: "consumes", owner: "invoicing", target: "priceResult", state: "complete" });
  json("opm_link", { path: file, kind: "yields", owner: "invoicing", target: "invoice", state: "draft" });
  json("opm_link", { path: file, kind: "requires", owner: "invoicing", target: "erp", note: "The **ERP** issues the number." });
  const r = json("opm_link", { path: file, kind: "changes", owner: "expiring", target: "invoice", fromState: "draft", toState: "sent" });
  json("opm_link", { path: file, kind: "tagged", owner: "invoice", target: "customer", tag: "is sent to" });
  json("opm_link", { path: file, kind: "invokes", owner: "pricing", target: "invoicing" });
  const m = model(file);
  assert.deepEqual(m.processes!.invoicing, {
    handledBy: ["user"],
    consumes: [{ object: "priceResult", state: "complete" }],
    yields: [{ object: "invoice", state: "draft" }],
    requires: [{ object: "erp", note: "The **ERP** issues the number." }],
  });
  assert.deepEqual(m.processes!.expiring.changes!.slice(-1), [{ object: "invoice", from: "draft", to: "sent" }]);
  assert.deepEqual(m.objects!.invoice.tagged, [{ object: "customer", tag: "is sent to" }]);
  assert.deepEqual(m.processes!.pricing.invokes, ["invoicing"]);
  assert.equal(r.summary.startsWith("0 errors") || r.summary.startsWith("OK"), true, r.summary);

  json("opm_link", { path: file, kind: "zoomsInto", owner: "pricing", target: "invoicing", index: 0 });
  assert.equal(model(file).processes!.pricing.zoomsInto![0], "invoicing");

  const again = json("opm_link", { path: file, kind: "handledBy", owner: "invoicing", target: "user" });
  assert.equal(again.changed, false);
  json("opm_link", { path: file, kind: "handledBy", owner: "invoicing", target: "user", note: "Only after approval." });
  assert.deepEqual(model(file).processes!.invoicing.handledBy, [{ object: "user", note: "Only after approval." }]);

  const unchanged = fs.readFileSync(file, "utf-8");
  assert.match(refused("opm_link", { path: file, kind: "yields", owner: "invoicing", target: "invoice", state: "paid" }), /no state "paid".*draft, sent/);
  assert.match(refused("opm_link", { path: file, kind: "requires", owner: "snapshot", target: "pricing" }), /stored on a process/);
  assert.match(refused("opm_link", { path: file, kind: "changes", owner: "invoicing", target: "invoice" }), /toState/);
  assert.match(refused("opm_link", { path: file, kind: "affects", owner: "invoicing", target: "invoice", state: "draft" }), /"changes"/);
  assert.match(refused("opm_link", { path: file, kind: "consumes", owner: "invoicing", target: "nothing" }), /No object or process "nothing"/);
  refused("opm_link", { path: file, kind: "owns", owner: "invoicing", target: "invoice" });
  assert.equal(fs.readFileSync(file, "utf-8"), unchanged, "a refused link writes nothing");
});

test("opm_unlink removes links, by state when asked, and zoomsInto entries", () => {
  const file = copy();
  json("opm_unlink", { path: file, kind: "requires", owner: "pricing", target: "customer" });
  assert.deepEqual(model(file).processes!.pricing.requires, ["pricingModule", "snapshot", "departmentData"]);
  json("opm_unlink", { path: file, kind: "conditions", owner: "pricing", target: "snapshot", state: "valid" });
  assert.equal(model(file).processes!.pricing.conditions, undefined, "the empty field goes with its last entry");
  json("opm_unlink", { path: file, kind: "zoomsInto", owner: "pricing", target: "leadTimeEstimating" });
  assert.deepEqual(model(file).processes!.pricing.zoomsInto, ["productPricing", "transportPricing"]);
  assert.ok(model(file).processes!.leadTimeEstimating, "the subprocess stays in the model");
  assert.match(refused("opm_unlink", { path: file, kind: "consumes", owner: "pricing", target: "snapshot" }), /no consumes link.*Its links:/);
});

test("opm_rename follows references into stories, for identifiers and states", () => {
  const file = copy();
  json("opm_rename", { path: file, id: "pricingModule", newId: "pricer" });
  let m = model(file);
  assert.ok(m.objects!.pricer && !m.objects!.pricingModule);
  assert.deepEqual(m.processes!.pricing.requires![0], "pricer");
  assert.deepEqual(m.stories!.getPrice.lanes, ["user", "generator", "snapshotStore", "pricer"]);
  assert.equal(m.stories!.getPrice.steps[2].handsOver!.to, "pricer");
  assert.equal(m.stories!.getPrice.steps[3].lane, "pricer");
  assert.ok(m.layout!.system.pricer);

  json("opm_rename", { path: file, id: "snapshot", state: "valid", newState: "current" });
  m = model(file);
  assert.deepEqual(m.objects!.snapshot.states, ["current", "expired"]);
  assert.deepEqual(m.processes!.pricing.conditions, [{ object: "snapshot", state: "current" }]);
  assert.equal(m.processes!.expiring.changes![0].from, "current");
  assert.equal(m.stories!.getPrice.steps[1].handsOver!.state, "current");
  assert.equal(json("opm_validate", { path: file }).errors, 0);

  assert.match(refused("opm_rename", { path: file, id: "pricer", newId: "snapshot" }), /already used/);
  assert.match(refused("opm_rename", { path: file, id: "snapshot", state: "gone", newState: "x" }), /no state "gone"/);
});

test("opm_set changes and removes fields; opm_delete removes things and states", () => {
  const file = copy();
  json("opm_set", { path: file, id: "customer", label: "Client", description: "The buyer.", note: "See the CRM." });
  assert.deepEqual(model(file).objects!.customer, { affiliation: "environmental", label: "Client", description: "The buyer.", note: "See the CRM." });
  json("opm_set", { path: file, id: "customer", label: null, note: null, affiliation: null });
  assert.deepEqual(model(file).objects!.customer, { description: "The buyer." });
  json("opm_set", { path: file, id: "hash", role: "module" });
  assert.equal(model(file).objects!.hash.role, "module");
  assert.match(refused("opm_set", { path: file, id: "pricing", states: ["a", "b"] }), /process has no states/);
  refused("opm_set", { path: file, id: "pricing" });
  refused("opm_set", { path: file, id: "hash", essence: "liquid" });

  const r = json("opm_delete", { path: file, ids: ["configuration"], states: [{ object: "transportPrice", state: "missing" }] });
  const m = model(file);
  assert.ok(!m.objects!.configuration);
  assert.equal(m.processes!.applying.affects, undefined);
  assert.deepEqual(m.objects!.transportPrice.states, ["exact", "approximate"]);
  assert.equal(m.stories!.changeWindow.steps[3].handsOver!.object, "configuration", "stories keep their text");
  assert.ok(r.introduced.some((d: { path: (string | number)[] }) => d.path[0] === "stories"), "the validator reports the step");
});

test("opm_add_story and opm_set_story write whole stories and refuse broken ones", () => {
  const file = copy();
  const story = {
    title: "Order a priced window",
    story: "As a user I want to order the window I priced.",
    lanes: ["user", "ui"],
    steps: [{ lane: "user", does: "Presses Order.", process: "configuring", handsOver: { object: "configuration", to: "ui" } }],
  };
  const r = json("opm_add_story", { path: file, id: "orderWindow", story });
  assert.deepEqual(model(file).stories!.orderWindow, story);
  assert.match(r.summary, /^OK|^0 errors/);
  assert.match(refused("opm_add_story", { path: file, id: "orderWindow", story }), /already exists/);

  const before = fs.readFileSync(file, "utf-8");
  refused("opm_set_story", { path: file, id: "orderWindow", story: { story: "No lanes." } });
  refused("opm_set_story", { path: file, id: "orderWindow", story: { ...story, steps: [{ lane: "user", does: "x", waits: 5 }] } });
  assert.equal(fs.readFileSync(file, "utf-8"), before, "a refused story writes nothing");

  json("opm_set_story", { path: file, id: "orderWindow", story: { ...story, doneWhen: ["The order names the snapshot."] } });
  assert.deepEqual(model(file).stories!.orderWindow.doneWhen, ["The order names the snapshot."]);
  const lane = json("opm_set_story", { path: file, id: "orderWindow", story: { ...story, lanes: ["user", "snapshot"] } });
  assert.ok(lane.introduced.some((d: { severity: string }) => d.severity === "error"), "a lane that is not an agent or a module is reported");
  json("opm_set_story", { path: file, id: "orderWindow", delete: true });
  assert.ok(!model(file).stories!.orderWindow);
});

test("P28 fields and opm_sync_story work through the MCP tools", () => {
  const file = copy();
  json("opm_set", {
    path: file,
    id: "pricingModule",
    deploymentName: "pricing_v1.2.0",
    capabilities: ["can_price"],
    owns: ["owns_price_result"],
  });
  json("opm_set", { path: file, id: "pricing", capability: "can_price" });
  json("opm_set", { path: file, id: "priceResult", authority: "owns_price_result" });
  const summary = json("opm_summary", { path: file });
  const pm = summary.modules.find((m: { id: string }) => m.id === "pricingModule");
  assert.equal(pm.deploymentName, "pricing_v1.2.0");
  assert.deepEqual(pm.capabilities, ["can_price"]);
  assert.deepEqual(pm.owns, ["owns_price_result"]);

  // Refusals for invalid P28 fields or wrong kind
  refused("opm_set", { path: file, id: "pricing", deploymentName: "pricing_v1.0.0" });
  refused("opm_set", { path: file, id: "pricingModule", capability: "can_price" });
  refused("opm_set", { path: file, id: "pricingModule", deploymentName: "invalid_name" });

  // Add a story referencing new lanes/processes/objects and sync it into the OPM model
  json("opm_add_story", {
    path: file,
    id: "exportOrder",
    story: {
      title: "Export Order",
      story: "As a user I want to export the order.",
      lanes: ["user", "exportModule"],
      steps: [
        { lane: "user", does: "Requests export.", process: "exportingOrder", handsOver: { object: "exportFile", state: "ready", to: "exportModule" } },
      ],
    },
    sync: true,
  });
  const m = model(file);
  assert.equal(m.objects!.exportModule.role, "module");
  assert.ok(m.objects!.exportFile.states!.includes("ready"));
  assert.ok(m.processes!.exportingOrder);
});

test("a new section goes before layout, and a file that is not JSON is never edited", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "opm-mcp-"));
  const file = path.join(dir, "small.opm.json");
  fs.writeFileSync(file, '{\n  "name": "Small",\n  "objects": {\n    "user": { "essence": "physical" }\n  },\n  "layout": {}\n}\n');
  json("opm_add_story", { path: file, id: "first", story: { story: "As a user I want a story.", lanes: ["user"], steps: [{ lane: "user", does: "Writes it." }] } });
  const t = fs.readFileSync(file, "utf-8");
  assert.ok(t.indexOf('"stories"') < t.indexOf('"layout"'));
  json("opm_add_process", { path: file, id: "writing" });
  assert.ok(fs.readFileSync(file, "utf-8").indexOf('"processes"') < fs.readFileSync(file, "utf-8").indexOf('"stories"'));

  fs.writeFileSync(file, '{ "objects": { "a": {} ');
  assert.match(refused("opm_add_object", { path: file, id: "b" }), /not valid JSON/);
  assert.equal(fs.readFileSync(file, "utf-8"), '{ "objects": { "a": {} ');

  const other = path.join(dir, "notes.json");
  fs.writeFileSync(other, "{}");
  assert.match(refused("opm_add_object", { path: other, id: "b" }), /not a \*\.opm\.json file/);
  assert.match(refused("opm_validate", { path: "model.opm.json" }), /not an absolute path/);
  assert.match(refused("opm_add_object", { path: file, id: "b", colour: "red" }), /Invalid arguments.*colour/);
});

test("a round trip of edits keeps the example valid and formatted", () => {
  const file = copy();
  const original = fs.readFileSync(file, "utf-8");
  json("opm_add_object", { path: file, id: "invoice", states: ["draft", "sent"] });
  json("opm_add_process", { path: file, id: "invoicing", parent: "pricing" });
  json("opm_link", { path: file, kind: "requires", owner: "invoicing", target: "pricingModule" });
  json("opm_link", { path: file, kind: "consumes", owner: "invoicing", target: "priceResult" });
  json("opm_link", { path: file, kind: "yields", owner: "invoicing", target: "invoice", state: "draft" });
  json("opm_rename", { path: file, id: "invoice", newId: "bill" });
  json("opm_set", { path: file, id: "bill", description: "What the customer pays." });
  const v = json("opm_validate", { path: file });
  assert.equal(v.errors, 0, JSON.stringify(v.diagnostics));
  const after = fs.readFileSync(file, "utf-8");
  assert.ok(changedLines(original, after) <= 12, `few lines change: ${changedLines(original, after)}`);
  const lines = after.split(/\r?\n/);
  assert.ok(lines.includes('    "bill": { "states": ["draft", "sent"], "description": "What the customer pays." }'));
  const at = lines.indexOf('    "invoicing": {');
  assert.deepEqual(lines.slice(at, at + 5), [
    '    "invoicing": {',
    '      "requires": ["pricingModule"],',
    '      "consumes": ["priceResult"],',
    '      "yields": [{ "object": "bill", "state": "draft" }]',
    "    }",
  ], "a one-line entry that grows past 120 characters gets one link per line");

  json("opm_delete", { path: file, ids: ["invoicing", "bill"] });
  assert.equal(fs.readFileSync(file, "utf-8"), original, "deleting what was added gives back the original text");
});
