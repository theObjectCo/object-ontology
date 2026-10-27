import { test } from "node:test";
import assert from "node:assert/strict";
import { fragmentOf } from "../src/core/edit";
import { editorLinks } from "../src/core/links";
import { validate } from "../src/core/validate";
import { EXAMPLE, errors, parse, run } from "./editHelpers";

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

test("renaming an identifier or a state follows into user stories; deleting leaves the story to the validator", () => {
  let t = run(EXAMPLE, { op: "renameId", oldId: "pricingModule", newId: "pricer" });
  t = run(t, { op: "renameId", oldId: "configuring", newId: "setting" });
  t = run(t, { op: "renameState", object: "snapshot", oldState: "valid", newState: "fresh" });
  const s = parse(t).stories!.getPrice;
  assert.deepEqual(s.lanes, ["user", "generator", "snapshotStore", "pricer"]);
  assert.equal(s.steps[0].process, "setting");
  assert.deepEqual(s.steps[2].handsOver, { object: "snapshot", state: "fresh", to: "pricer" });
  assert.equal(s.steps[3].lane, "pricer");
  assert.deepEqual(validate(parse(t)).filter((d) => d.severity !== "info"), []);
  const deleted = run(t, { op: "deleteElements", ids: ["pricer"] });
  assert.deepEqual(parse(deleted).stories!.getPrice.lanes, s.lanes);
  assert.ok(errors(deleted).includes("unknown-object"));
});

test("a one-line entry that grows past 120 characters is written again with one field per line", () => {
  const t = run(EXAMPLE, { op: "addLink", kind: "consumption", from: "configuration", to: "transportPricing" });
  const after = run(t, { op: "addLink", kind: "instrument", from: "pricingModule", to: "transportPricing", fromState: undefined });
  const lines = after.split(/\r?\n/);
  const at = lines.findIndex((l) => l.startsWith('    "transportPricing": {'));
  assert.deepEqual(lines.slice(at, at + 5), [
    '    "transportPricing": {',
    '      "requires": ["departmentData", "pricingModule"],',
    '      "yields": ["transportPrice"],',
    '      "consumes": ["configuration"]',
    "    },",
  ]);
});

test("subprocesses and stories have their own operations, and new sections keep the order of the format", () => {
  let t = run(EXAMPLE, { op: "addElement", kind: "process", viewId: "system", label: "Invoicing" });
  t = run(t, { op: "addSubprocess", parent: "pricing", id: "invoicing", index: 0 });
  assert.deepEqual(parse(t).processes!.pricing.zoomsInto, ["invoicing", "productPricing", "transportPricing", "leadTimeEstimating"]);
  assert.throws(() => run(t, { op: "addSubprocess", parent: "configuring", id: "invoicing" }), /one parent/);
  t = run(t, { op: "removeSubprocess", parent: "pricing", id: "invoicing" });
  assert.deepEqual(parse(t).processes!.pricing.zoomsInto, ["productPricing", "transportPricing", "leadTimeEstimating"]);

  const small = '{\n  "objects": {\n    "user": { "essence": "physical" }\n  },\n  "layout": {}\n}\n';
  const story = { story: "As a user I want a story.", lanes: ["user"], steps: [{ lane: "user", does: "Writes it." }] };
  const withStory = run(small, { op: "setStory", id: "first", story });
  assert.ok(withStory.indexOf('"stories"') < withStory.indexOf('"layout"'));
  assert.deepEqual(parse(withStory).stories, { first: story });
  assert.equal(run(withStory, { op: "setStory", id: "first", story: null }), small, "removing the only story removes the section");
});

test("syncStory materialises lanes, handed-over objects, states, processes and links from a Makigami story", () => {
  const initial = JSON.stringify({
    name: "Makigami First",
    objects: {
      customer: { essence: "physical" },
    },
    stories: {
      quoteFlow: {
        title: "Quote Flow",
        story: "As a customer I want a quote.",
        lanes: ["customer", "salesDesk", "pricingEngine"],
        steps: [
          {
            lane: "customer",
            does: "Submits inquiry.",
            process: "submittingInquiry",
            handsOver: { object: "inquiry", state: "submitted", to: "salesDesk" },
          },
          {
            lane: "salesDesk",
            does: "Validates inquiry.",
            process: "validatingInquiry",
            handsOver: { object: "inquiry", state: "validated", to: "pricingEngine" },
          },
          {
            lane: "pricingEngine",
            does: "Computes price.",
            process: "computingPrice",
            handsOver: { object: "quote", to: "customer" },
          },
        ],
      },
    },
  }, null, 2);

  const synced = run(initial, { op: "syncStory", id: "quoteFlow" });
  const m = parse(synced);
  assert.equal(m.objects!.salesDesk.role, "module");
  assert.equal(m.objects!.pricingEngine.role, "module");
  assert.deepEqual(m.objects!.inquiry.states, ["submitted", "validated"]);
  assert.ok(m.objects!.quote);
  assert.deepEqual(m.processes!.submittingInquiry.handledBy, ["customer"]);
  assert.deepEqual(m.processes!.submittingInquiry.yields, [{ object: "inquiry", state: "submitted" }]);
  assert.ok(m.processes!.validatingInquiry.requires!.some((e) => e === "salesDesk"));
  assert.deepEqual(m.processes!.validatingInquiry.changes, [{ object: "inquiry", from: "submitted", to: "validated" }]);
  assert.ok(m.processes!.computingPrice.requires!.some((e) => e === "pricingEngine"));
  assert.deepEqual(m.processes!.computingPrice.yields, ["quote"]);
  assert.deepEqual(errors(synced), []);
});
