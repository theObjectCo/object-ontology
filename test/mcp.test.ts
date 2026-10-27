import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as path from "path";
import { TOOLS } from "../src/mcp/tools";
import { changedLines, copy, json, model, refused, text } from "./mcpHelpers";

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
