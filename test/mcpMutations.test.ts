import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { changedLines, copy, json, model, refused } from "./mcpHelpers";

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
