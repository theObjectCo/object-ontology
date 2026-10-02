import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import { EditError, Operation, applyOperation, compact, fragmentOf, minimalEdit } from "../src/core/edit";
import { editorLinks } from "../src/core/links";
import { Model } from "../src/core/model";
import { validate } from "../src/core/validate";

const run = (text: string, op: Operation) => applyOperation(text, op).text;
/** The example model without its layout, which changes whenever the example is edited in the diagram editor. */
const EXAMPLE = Object.keys((JSON.parse(fs.readFileSync("examples/window-pricing/model.opm.json", "utf-8")) as Model).layout ?? {})
  .reduce((text, viewId) => run(text, { op: "setLayout", viewId, positions: null }), fs.readFileSync("examples/window-pricing/model.opm.json", "utf-8"));
const parse = (text: string) => JSON.parse(text) as Model;
const errors = (text: string) => validate(parse(text)).filter((d) => d.severity === "error").map((d) => d.code);
/** Lines that differ between two texts, as a rough measure of the diff. */
const changedLines = (a: string, b: string) => {
  const la = a.split("\n"), lb = b.split("\n");
  const common = new Set(la);
  return lb.filter((l) => !common.has(l)).length + la.filter((l) => !new Set(lb).has(l)).length;
};

test("compact writes one-line JSON in the style of the models", () => {
  assert.equal(compact({ a: [1, 2], b: "x" }), '{ "a": [1, 2], "b": "x" }');
  assert.equal(compact({}), "{}");
});

test("minimalEdit replaces only the changed middle", () => {
  assert.deepEqual(minimalEdit("abcdef", "abXYef"), [2, 4, "XY"]);
  assert.equal(minimalEdit("same", "same"), undefined);
});

test("adding an object inserts one line and keeps the file valid", () => {
  const after = run(EXAMPLE, { op: "addElement", kind: "object", viewId: "system" });
  assert.ok(parse(after).objects!.newObject);
  assert.ok(changedLines(EXAMPLE, after) <= 3, "only the new entry and the comma before it change");
  const second = run(after, { op: "addElement", kind: "object", viewId: "system" });
  assert.ok(parse(second).objects!.newObject2);
});

test("a new element in a manual view gets its position in the same edit", () => {
  const manual = run(EXAMPLE, { op: "setLayout", viewId: "system", positions: { user: [10, 20] } });
  const after = run(manual, { op: "addElement", kind: "process", viewId: "system", label: "Shipping", pos: [100.4, 50.6] });
  assert.deepEqual(parse(after).layout!.system.shipping, [100, 51]);
  assert.deepEqual(parse(after).processes!.shipping, {});
  assert.ok(!parse(run(EXAMPLE, { op: "addElement", kind: "object", viewId: "system", pos: [1, 1] })).layout, "an auto view stays without layout");
});

test("an empty file gets the minimal structure", () => {
  const after = run("", { op: "addElement", kind: "object", viewId: "system" });
  assert.deepEqual(parse(after), { objects: { newObject: {} } });
});

test("links are stored in the field of their kind, with states", () => {
  let t = run(EXAMPLE, { op: "addLink", kind: "instrument", from: "decision", to: "freezing", fromState: "applied" });
  assert.deepEqual(parse(t).processes!.freezing.requires!.slice(-1), [{ object: "decision", state: "applied" }]);
  t = run(t, { op: "addLink", kind: "effect", from: "expiring", to: "decision", fromState: "passed", toState: "rejected" });
  assert.deepEqual(parse(t).processes!.expiring.changes!.slice(-1), [{ object: "decision", from: "rejected", to: "passed" }],
    "an effect drawn from the process is stored with the states of the object, from the object's side");
  t = run(t, { op: "addLink", kind: "tagged", from: "priceRequest", to: "customer", tag: "is made for" });
  assert.deepEqual(parse(t).objects!.priceRequest.tagged, [{ object: "customer", tag: "is made for" }]);
  t = run(t, { op: "addLink", kind: "aggregation", from: "freezing", to: "expiring" });
  assert.deepEqual(parse(t).processes!.freezing.consistsOf, ["expiring"]);
  assert.deepEqual(errors(t), []);
});

test("a link kind that the pair does not allow is refused", () => {
  assert.throws(() => run(EXAMPLE, { op: "addLink", kind: "result", from: "snapshot", to: "pricing" }), EditError);
  assert.throws(() => run(EXAMPLE, { op: "addLink", kind: "exhibition", from: "pricing", to: "freezing" }), EditError);
});

test("renaming an id updates every reference and layout key, and adds no errors", () => {
  const withLayout = run(EXAMPLE, { op: "setLayout", viewId: "system", positions: { snapshot: [1, 2], pricing: [3, 4] } });
  const after = run(withLayout, { op: "renameId", oldId: "snapshot", newId: "configurationSnapshot" });
  assert.ok(!/"snapshot"/.test(after), "no reference to the old id is left");
  assert.deepEqual(parse(after).layout!.system.configurationSnapshot, [1, 2]);
  assert.deepEqual(errors(after), []);
  assert.deepEqual(Object.keys(parse(after).objects!), Object.keys(parse(EXAMPLE).objects!).map((k) => (k === "snapshot" ? "configurationSnapshot" : k)),
    "the renamed entry keeps its place");
  const proc = run(run(EXAMPLE, { op: "setLayout", viewId: "pricing", positions: { productPricing: [0, 0] } }), { op: "renameId", oldId: "pricing", newId: "quoting" });
  assert.ok(parse(proc).layout!.quoting, "the zoom view layout follows the process");
  assert.throws(() => run(EXAMPLE, { op: "renameId", oldId: "snapshot", newId: "pricing" }), /already used/);
  assert.throws(() => run(EXAMPLE, { op: "renameId", oldId: "snapshot", newId: "Bad id" }), /not a valid identifier/);
});

test("deleting an element removes its links, empty lists, view entries and positions", () => {
  const withLayout = run(EXAMPLE, { op: "setLayout", viewId: "system", positions: { customer: [1, 2], pricing: [3, 4] } });
  const after = run(withLayout, { op: "deleteElements", ids: ["customer"] });
  const m = parse(after);
  assert.ok(!m.objects!.customer);
  assert.deepEqual(m.processes!.productPricing.requires, ["snapshot"]);
  assert.ok(!m.objects!.erp.consistsOf, "an emptied list is removed");
  assert.ok(!("customer" in m.layout!.system));
  assert.ok(!/"customer"/.test(after));
  assert.match(after, /"erp": \{ "role": "module", "affiliation": "environmental" \},/, "one-line definitions stay on one line");
  assert.match(after, /"productPricing": \{ "requires": \["snapshot"\], "yields": \["productPrice"\] \},/);
});

test("deleting links by id removes only those entries", () => {
  const link = editorLinks(parse(EXAMPLE)).find((l) => l.kind === "condition" && l.to === "pricing")!;
  const after = run(EXAMPLE, { op: "deleteElements", ids: [], links: [link.id] });
  assert.ok(!parse(after).processes!.pricing.conditions);
  assert.equal(editorLinks(parse(after)).length, editorLinks(parse(EXAMPLE)).length - 1);
});

test("a link can change kind, states and direction", () => {
  const link = editorLinks(parse(EXAMPLE)).find((l) => l.kind === "instrument" && l.from === "changeProposal")!;
  let t = run(EXAMPLE, { op: "updateLink", id: link.id, kind: "consumption" });
  assert.ok(!parse(t).processes!.validating.requires!.includes("changeProposal"));
  assert.ok(parse(t).processes!.validating.consumes!.includes("changeProposal"));
  const part = editorLinks(parse(t)).find((l) => l.kind === "aggregation" && l.from === "snapshot" && l.to === "bom")!;
  t = run(t, { op: "updateLink", id: part.id, reverse: true });
  assert.deepEqual(parse(t).objects!.bom.consistsOf, ["snapshot"]);
  const cond = editorLinks(parse(t)).find((l) => l.kind === "condition" && l.to === "pricing")!;
  t = run(t, { op: "updateLink", id: cond.id, fromState: "expired" });
  assert.deepEqual(parse(t).processes!.pricing.conditions, [{ object: "snapshot", state: "expired" }]);
  t = run(t, { op: "updateLink", id: editorLinks(parse(t)).find((l) => l.kind === "condition" && l.to === "pricing")!.id, fromState: null });
  assert.deepEqual(parse(t).processes!.pricing.conditions, [{ object: "snapshot" }]);
});

test("the first move saves every position of the view on one line, later moves only the moved ones", () => {
  const first = applyOperation(EXAMPLE, { op: "moveElements", viewId: "system", positions: { user: [5, 5] }, all: { user: [0, 0], ui: [10.2, 20.7] } });
  assert.deepEqual(parse(first.text).layout!.system, { user: [5, 5], ui: [10, 21] });
  assert.match(first.text, /"system": \{ "user": \[5, 5\], "ui": \[10, 21\] \}/);
  const second = run(first.text, { op: "moveElements", viewId: "system", positions: { ui: [30, 40] } });
  assert.deepEqual(parse(second).layout!.system, { user: [5, 5], ui: [30, 40] });
  const reset = run(second, { op: "setLayout", viewId: "system", positions: null });
  assert.ok(!parse(reset).layout, "reset of the last view removes the section");
});

test("states can be renamed, reordered and deleted with their references", () => {
  let t = run(EXAMPLE, { op: "renameState", object: "snapshot", oldState: "valid", newState: "current" });
  assert.deepEqual(parse(t).objects!.snapshot.states, ["current", "expired"]);
  assert.deepEqual(parse(t).processes!.pricing.conditions, [{ object: "snapshot", state: "current" }]);
  assert.deepEqual(parse(t).processes!.expiring.changes, [{ object: "snapshot", from: "current", to: "expired" }]);
  t = run(t, { op: "moveState", object: "snapshot", state: "expired", index: 0 });
  assert.deepEqual(parse(t).objects!.snapshot.states, ["expired", "current"]);
  t = run(t, { op: "deleteState", object: "snapshot", state: "expired" });
  assert.ok(!parse(t).objects!.snapshot.states?.includes("expired"));
  assert.ok(!parse(t).processes!.expiring.changes, "a change to the deleted state becomes a plain effect");
  assert.deepEqual(parse(t).processes!.expiring.affects, ["snapshot"]);
  t = run(t, { op: "addState", object: "snapshot" });
  assert.ok(parse(t).objects!.snapshot.states!.includes("state"));
});

test("updating fields keeps a one-line definition on one line", () => {
  const after = run(EXAMPLE, { op: "updateElement", id: "user", patch: { label: "Customer User" } });
  assert.match(after, /"user": \{ "essence": "physical", "label": "Customer User" \}/);
  const removed = run(after, { op: "updateElement", id: "user", patch: { label: null } });
  assert.match(removed, /"user": \{ "essence": "physical" \}/);
  const module = run(EXAMPLE, { op: "updateElement", id: "customer", patch: { role: true } });
  assert.equal(parse(module).objects!.customer.role, "module");
});

test("subprocesses can be reordered and a zoom view can be opened for any process", () => {
  const t = run(EXAMPLE, { op: "reorderSubprocess", parent: "pricing", id: "leadTimeEstimating", index: 0 });
  assert.deepEqual(parse(t).processes!.pricing.zoomsInto, ["leadTimeEstimating", "productPricing", "transportPricing"]);
  const z = run(EXAMPLE, { op: "openZoom", process: "freezing" });
  assert.deepEqual(parse(z).processes!.freezing.zoomsInto, []);
  const sub = run(z, { op: "addElement", kind: "process", viewId: "freezing", label: "Hashing", parentId: "freezing" });
  assert.deepEqual(parse(sub).processes!.freezing.zoomsInto, ["hashing"]);
});

test("copy and paste keeps the links inside the selection and renames conflicting ids", () => {
  const model = parse(EXAMPLE);
  const frag = fragmentOf(model, ["freezing", "snapshot", "generator"], { snapshot: [10, 10] });
  assert.deepEqual(frag.processes!.freezing.requires, ["generator"], "links to things outside the selection are dropped");
  const manual = run(EXAMPLE, { op: "setLayout", viewId: "system", positions: { user: [0, 0] } });
  const result = applyOperation(manual, { op: "paste", fragment: frag, viewId: "system" });
  const m = parse(result.text);
  assert.deepEqual(m.processes!.freezing2.yields, ["snapshot2"]);
  assert.deepEqual(m.layout!.system.snapshot2, [34, 34]);
  assert.match(result.message!, /freezing → freezing2/);
});

test("stale layout entries can be removed in one edit", () => {
  const t = run(EXAMPLE, { op: "setLayout", viewId: "system", positions: { ghost: [1, 1], user: [2, 2] } });
  const infos = validate(parse(t)).filter((d) => d.code === "layout-stale");
  assert.equal(infos.length, 1);
  assert.equal(infos[0].severity, "info");
  const clean = run(t, { op: "removeStaleLayout" });
  assert.deepEqual(parse(clean).layout!.system, { user: [2, 2] });
});

test("saving a selection creates a custom view", () => {
  const t = run(EXAMPLE, { op: "saveView", name: "Payments", ids: ["pricing", "priceResult"] });
  assert.deepEqual(parse(t).views!.payments, { title: "Payments", things: ["pricing", "priceResult"] });
});

test("the first label of a new element also sets its identifier, in one edit", () => {
  const added = run(EXAMPLE, { op: "addElement", kind: "process", viewId: "configuring", parentId: "configuring" });
  const named = applyOperation(added, { op: "setLabel", id: "newProcess", label: "Checking Stock", deriveId: true });
  const m = parse(named.text);
  assert.deepEqual(named.select, ["checkingStock"]);
  assert.deepEqual(m.processes!.checkingStock, {}, "the label equals the one derived from the id, so it is not written");
  assert.ok(m.processes!.configuring.zoomsInto!.includes("checkingStock") && !m.processes!.newProcess);
  const odd = parse(run(added, { op: "setLabel", id: "newProcess", label: "ERP sync (nightly)", deriveId: true }));
  assert.deepEqual(odd.processes!.erpSyncNightly, { label: "ERP sync (nightly)" });
  const kept = parse(run(EXAMPLE, { op: "setLabel", id: "user", label: "Customer Staff" }));
  assert.deepEqual(kept.objects!.user, { essence: "physical", label: "Customer Staff" }, "without deriveId the id stays");
  const taken = parse(run(added, { op: "setLabel", id: "newProcess", label: "Pricing", deriveId: true }));
  assert.ok(taken.processes!.pricing2, "a taken id gets a number");
});

test("a new element in a custom view with a list of things joins the list", () => {
  const saved = run(EXAMPLE, { op: "saveView", name: "Pricing inputs", ids: ["priceRequest", "pricing"] });
  const added = parse(run(saved, { op: "addElement", kind: "object", viewId: "pricingInputs", label: "Discount" }));
  assert.deepEqual(added.views!.pricingInputs.things, ["priceRequest", "pricing", "discount"]);
});

test("a manual zoom view needs no positions for its subprocesses", () => {
  const moved = run(EXAMPLE, { op: "moveElements", viewId: "pricing", positions: { pricing: [10, 10] }, all: { pricing: [0, 0], snapshot: [400, 0] } });
  const missing = validate(parse(moved)).filter((d) => d.code === "layout-missing").map((d) => d.element);
  assert.ok(!missing.includes("productPricing") && !missing.includes("transportPricing"), missing.join(", "));
});

test("notes on things and links: object form while a note is set, bare identifier again without it", () => {
  const text = JSON.stringify({
    objects: { a: {}, b: { states: ["x", "y"] } },
    processes: { p: { requires: ["a"], yields: [{ object: "b", state: "x" }], invokes: ["q"] }, q: { affects: ["a"] } },
  }, null, 2);
  const linkTo = (t: string, kind: string, to: string) => editorLinks(parse(t)).find((l) => l.kind === kind && (l.to === to || l.from === to))!;

  let t = run(text, { op: "updateElement", id: "a", patch: { note: "See [spec](docs/spec.md)\nline two" } });
  assert.equal(parse(t).objects!.a.note, "See [spec](docs/spec.md)\nline two");

  t = run(t, { op: "updateLink", id: linkTo(t, "instrument", "a").id, note: "why a" });
  assert.deepEqual(parse(t).processes!.p.requires, [{ object: "a", note: "why a" }]);
  assert.equal(linkTo(t, "instrument", "a").note, "why a");

  t = run(t, { op: "updateLink", id: linkTo(t, "invocation", "q").id, note: "async" });
  assert.deepEqual(parse(t).processes!.p.invokes, [{ process: "q", note: "async" }]);
  t = run(t, { op: "updateLink", id: linkTo(t, "result", "b").id, note: "first" });
  assert.deepEqual(parse(t).processes!.p.yields, [{ object: "b", state: "x", note: "first" }]);

  // a change of kind or a cleared state keeps the note
  t = run(t, { op: "updateLink", id: linkTo(t, "instrument", "a").id, kind: "consumption" });
  assert.deepEqual(parse(t).processes!.p.consumes, [{ object: "a", note: "why a" }]);
  t = run(t, { op: "deleteState", object: "b", state: "x" });
  assert.deepEqual(parse(t).processes!.p.yields, [{ object: "b", note: "first" }]);

  // renaming and deleting reach the targets of entries in object form
  t = run(t, { op: "renameId", oldId: "q", newId: "r" });
  assert.deepEqual(parse(t).processes!.p.invokes, [{ process: "r", note: "async" }]);
  assert.deepEqual(validate(parse(t)).filter((d) => d.severity === "error"), []);
  t = run(t, { op: "deleteElements", ids: ["r"] });
  assert.equal(parse(t).processes!.p.invokes, undefined);

  // removing the note returns to the bare identifier
  t = run(t, { op: "updateLink", id: linkTo(t, "consumption", "a").id, note: null });
  assert.deepEqual(parse(t).processes!.p.consumes, ["a"]);
  t = run(t, { op: "updateElement", id: "a", patch: { note: null } });
  assert.equal(parse(t).objects!.a.note, undefined);
});

test("copy and paste keeps notes on links inside the selection", () => {
  const text = JSON.stringify({ objects: { a: {} }, processes: { p: { yields: [{ object: "a", note: "n" }] } } }, null, 2);
  const frag = fragmentOf(parse(text), ["a", "p"]);
  const t = run(text, { op: "paste", fragment: frag, viewId: "system" });
  assert.deepEqual(parse(t).processes!.p2.yields, [{ object: "a2", note: "n" }]);
});
