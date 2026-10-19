import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import { Model } from "../src/core/model";
import { validate } from "../src/core/validate";
import { entryText } from "../src/core/methods/common";
import { dsm, dsmMarkdown, partition } from "../src/core/methods/dsm";
import { flow, flowMermaid } from "../src/core/methods/flow";
import { icom, idef0, idef0Markdown, idef0Processes } from "../src/core/methods/idef0";
import { documentWithMethods, methodsMarkdown, parseMethods } from "../src/core/methods/index";
import { sipoc, sipocMarkdown } from "../src/core/methods/sipoc";
import { markdown } from "../src/core/render";

const example = JSON.parse(fs.readFileSync("examples/window-pricing/model.opm.json", "utf-8")) as Model;

// A clerk handles orders: three subprocesses in three modules, and a report that closes a cycle.
const small: Model = {
  objects: {
    clerk: { essence: "physical" },
    analyst: { essence: "physical" },
    intake: { role: "module" },
    review: { role: "module" },
    archive: { role: "module" },
    supplierPortal: { role: "module", affiliation: "environmental", consistsOf: ["catalogue"] },
    catalogue: { affiliation: "environmental" },
    order: { states: ["draft", "checked"] },
    form: {},
    ticket: {},
    record: {},
    report: {},
  },
  processes: {
    handling: { handledBy: ["clerk"], zoomsInto: ["receiving", "checking", "filing"] },
    receiving: { requires: ["intake"], consumes: ["form"], yields: ["order"] },
    checking: {
      requires: ["review", "catalogue"],
      yields: ["ticket"],
      changes: [{ object: "order", from: "draft", to: "checked" }],
      conditions: [{ object: "order", state: "draft" }],
    },
    filing: { requires: ["archive"], consumes: ["ticket"], yields: ["record"], conditions: [{ object: "order", state: "checked" }] },
    reporting: { handledBy: ["analyst"], requires: ["review", "record"], yields: ["report"] },
  },
};

const texts = (model: Model, list: Parameters<typeof entryText>[1][]) => list.map((e) => entryText(model, e));

test("the fixture is a valid model", () => {
  assert.deepEqual(validate(small).filter((d) => d.severity === "error"), []);
});

test("IDEF0: a box takes inputs, controls, outputs and mechanisms from the links", () => {
  const b = icom(small, "checking");
  assert.deepEqual(texts(small, b.inputs), ["Catalogue (not consumed)", "Order (draft)"], "a changed object comes in in its from state");
  assert.deepEqual(texts(small, b.controls), ["Order (draft)"]);
  assert.deepEqual(texts(small, b.outputs), ["Ticket", "Order (draft → checked)"]);
  assert.deepEqual(texts(small, b.mechanisms), ["Review"]);
});

test("IDEF0: what the subprocesses make and use inside stays inside the A-0 box", () => {
  const d = idef0(small, "handling");
  assert.deepEqual(texts(small, d.context.inputs), ["Form", "Catalogue (not consumed)"]);
  assert.deepEqual(d.context.controls, [], "order is made inside, so its conditions are internal");
  assert.deepEqual(texts(small, d.context.outputs), ["Order", "Order (draft → checked)", "Record"], "the ticket is consumed inside");
  assert.deepEqual(texts(small, d.context.mechanisms), ["Clerk (agent)", "Intake", "Review", "Archive"]);
});

test("IDEF0: the A0 decomposition numbers the subprocesses and links them by objects", () => {
  const d = idef0(small, "handling");
  assert.deepEqual(d.boxes.map((b) => `${b.node} ${b.process}`), ["A1 receiving", "A2 checking", "A3 filing"]);
  assert.deepEqual(d.arrows, [
    { from: 0, to: 1, object: "order", role: "control" },
    { from: 0, to: 2, object: "order", role: "control" },
    { from: 1, to: 2, object: "ticket", role: "input" },
    { from: 1, to: 2, object: "order", role: "control" },
  ]);
});

test("IDEF0 of the example: Pricing and Configuring", () => {
  const pricing = idef0(example, "pricing").context;
  assert.deepEqual(texts(example, pricing.inputs), ["Price Request", "Snapshot (not consumed)", "Customer (not consumed)", "Department Data (not consumed)"]);
  assert.deepEqual(texts(example, pricing.controls), ["Snapshot (valid)"]);
  assert.deepEqual(texts(example, pricing.outputs), ["Price Result", "Product Price", "Transport Price", "Lead Time"]);
  assert.deepEqual(texts(example, pricing.mechanisms), ["Pricing Module"]);
  const configuring = idef0(example, "configuring");
  assert.deepEqual(texts(example, configuring.context.outputs), ["Decision", "Configuration (affected)", "Decision (passed → applied)"]);
  assert.deepEqual(texts(example, configuring.context.mechanisms), ["User (agent)", "UI", "Generator"]);
  assert.deepEqual(configuring.arrows.map((a) => `${a.from}>${a.to} ${a.object} ${a.role}`), [
    "0>1 changeProposal input", "0>2 changeProposal input", "1>2 decision control",
  ]);
  assert.deepEqual(idef0Processes(example), ["configuring", "contextUpdating", "freezing", "expiring", "pricing"]);
});

test("SIPOC: suppliers and customers come from the other processes and the environment", () => {
  const s = sipoc(small, "handling");
  assert.deepEqual(s.steps, ["receiving", "checking", "filing"]);
  assert.deepEqual(s.inputs.map((i) => [i.entry.object, i.suppliers]), [
    ["form", [{ kind: "outside" }]],
    ["catalogue", [{ kind: "environment", id: "supplierPortal" }]],
  ]);
  const record = s.outputs.find((o) => o.entry.object === "record")!;
  assert.deepEqual(record.customers, [{ kind: "process", id: "reporting" }, { kind: "agent", id: "analyst" }]);
  assert.deepEqual(s.outputs.find((o) => o.entry.object === "order")!.customers, [{ kind: "outside" }]);
});

test("SIPOC of the example: a supplier that leaves another state is not a supplier", () => {
  const s = sipoc(example, "pricing");
  const of = (object: string, state?: string) => s.inputs.find((i) => i.entry.object === object && i.entry.state === state)!.suppliers;
  assert.deepEqual(of("snapshot"), [{ kind: "process", id: "freezing" }, { kind: "process", id: "expiring" }]);
  assert.deepEqual(of("snapshot", "valid"), [{ kind: "process", id: "freezing" }], "Expiring leaves the snapshot expired");
  assert.deepEqual(of("customer"), [{ kind: "environment", id: "erp" }]);
  assert.deepEqual(of("priceRequest"), [{ kind: "outside" }]);
  const freezing = sipoc(example, "freezing");
  assert.deepEqual(freezing.inputs.map((i) => i.suppliers), [[{ kind: "process", id: "applying" }], [{ kind: "process", id: "contextUpdating" }]]);
  assert.deepEqual(freezing.outputs[0].customers.map((c) => c.kind === "outside" ? "" : c.id), ["expiring", "pricing", "productPricing"]);
  const expiring = sipoc(example, "expiring");
  assert.deepEqual(expiring.inputs.map((i) => [entryText(example, i.entry), i.suppliers]), [["Snapshot (valid)", [{ kind: "process", id: "freezing" }]]], "a changed object is an input");
  assert.deepEqual(expiring.outputs[0].customers, [{ kind: "process", id: "pricing" }, { kind: "process", id: "productPricing" }]);
  const stateful: Model = {
    objects: { a: { states: ["x", "y"] } },
    processes: {
      p: { changes: [{ object: "a", from: "x", to: "y" }] },
      q: { changes: [{ object: "a", from: "y", to: "x" }] },
      r: { conditions: [{ object: "a", state: "x" }], yields: ["a"] },
    },
  };
  assert.deepEqual(sipoc(stateful, "p").outputs[0].customers, [{ kind: "process", id: "q" }], "R waits for A in x, which P leaves in y");
});

test("DSM: cells list the objects one module gives and another takes", () => {
  const d = dsm(small);
  assert.deepEqual(d.cells.intake.review, ["order"]);
  assert.deepEqual(d.cells.review.archive, ["order", "ticket"]);
  assert.deepEqual(d.cells.archive.review, ["record"]);
  assert.deepEqual(d.cells.archive.analyst, ["record"]);
  assert.equal(d.cells.review.review, undefined, "no diagonal");
});

test("DSM: partitioning keeps a cycle together and puts givers first", () => {
  const d = dsm(small);
  assert.deepEqual(d.order, ["clerk", "intake", "review", "archive", "analyst", "supplierPortal"]);
  assert.deepEqual(d.cycles, [["review", "archive"]]);
  assert.deepEqual(dsm(small, { agents: false }).order, ["intake", "review", "archive", "supplierPortal"]);
  assert.deepEqual(partition(["a", "b", "c"], (id) => ({ a: [], b: ["a"], c: ["b"] })[id]!), [["c"], ["b"], ["a"]]);
});

test("DSM of the example", () => {
  const d = dsm(example);
  assert.deepEqual(d.order, ["user", "ui", "generator", "snapshotStore", "pricingModule", "erp"]);
  assert.deepEqual(d.cells.ui.generator, ["changeProposal"]);
  assert.deepEqual(d.cells.generator.snapshotStore, ["contextManifest", "configuration", "snapshot"], "Freezing yields the snapshot that Expiring changes");
  assert.deepEqual(d.cells.snapshotStore.pricingModule, ["snapshot"]);
  assert.deepEqual(d.cycles, []);
});

test("process flow: lanes from the first module, objects on the arrows", () => {
  const f = flow(small, "handling");
  assert.deepEqual(f.lanes, [{ id: "intake", kind: "module" }, { id: "review", kind: "module" }, { id: "archive", kind: "module" }]);
  assert.deepEqual(f.edges, [
    { from: 0, to: 1, objects: ["order"], next: true },
    { from: 0, to: 2, objects: ["order"], next: false },
    { from: 1, to: 2, objects: ["ticket", "order"], next: true },
  ]);
  const pricing = flow(example, "pricing");
  assert.deepEqual(pricing.lanes, [{ id: "pricingModule", kind: "module" }], "subprocesses without a module run in their parent's");
  const configuring = flow(example, "configuring");
  assert.deepEqual(configuring.activities.map((a) => configuring.lanes[a.lane].id), ["ui", "generator", "generator"]);
  const agentOnly: Model = { objects: { clerk: { essence: "physical" }, a: {} }, processes: { p: { zoomsInto: ["q", "r"] }, q: { handledBy: ["clerk"], yields: ["a"] }, r: { consumes: ["a"] } } };
  assert.deepEqual(flow(agentOnly, "p").lanes, [{ id: "clerk", kind: "agent" }, { kind: "none" }]);
});

test("process flow as Mermaid: lanes are subgraphs", () => {
  const m = flowMermaid(small, flow(small, "handling"));
  assert.ok(m.startsWith("flowchart LR"));
  assert.ok(m.includes('subgraph lane1["Review"]'));
  assert.ok(m.includes('a1 -->|"Ticket, Order"| a2'));
  assert.ok(m.includes('a0 -.->|"Order"| a2'));
  assert.ok(m.includes("a2 --> stop"));
});

test("markdown sections of each method", () => {
  const idef = idef0Markdown(small).join("\n");
  assert.ok(idef.includes("| A0 | Handling | Form, Catalogue (not consumed) | none | Order, Order (draft → checked), Record | Clerk (agent), Intake, Review, Archive |"));
  assert.ok(idef.includes('b1 -->|"Ticket"| b2'));
  assert.ok(idef.includes('b1 -.->|"Order"| b2'));
  const sip = sipocMarkdown(small).join("\n");
  assert.ok(sip.includes("| outside the model | Form | 1. Receiving | Order | outside the model |"));
  assert.ok(sip.includes("| Supplier Portal (environment) | Catalogue (not consumed) | 2. Checking | Order (draft → checked) | outside the model |"));
  assert.ok(sip.includes("|  |  | 3. Filing | Record | Reporting, Analyst |"));
  const matrix = dsmMarkdown(small).join("\n");
  assert.ok(matrix.includes("| 3. Review |  |  | ■ | Order, Ticket |  |  |"));
  assert.ok(matrix.includes("Cycles: Review, Archive."));
});

test("the export appends the chosen methods after the OPM document", () => {
  const doc = documentWithMethods(example);
  assert.ok(doc.startsWith(markdown(example)));
  for (const h of ["## IDEF0", "## SIPOC", "## N² matrix of modules", "## Process flow"]) assert.ok(doc.includes(h), h);
  assert.equal(documentWithMethods(example, []), markdown(example));
  assert.deepEqual(parseMethods("dsm,idef0"), ["idef0", "dsm"]);
  assert.deepEqual(parseMethods("none"), []);
  assert.throws(() => parseMethods("raci"), /Unknown method: raci/);
  assert.equal(methodsMarkdown({}), "");
});
