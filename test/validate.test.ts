import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import { check, locate, structureErrors } from "../src/core/load";
import { Model } from "../src/core/model";
import { collectEnumValues, validate } from "../src/core/validate";
import { modelName, starterModel } from "../src/core/template";
import { dataObjects, draftSchema, schemaFileFor } from "../src/core/schemagen";

const EXAMPLE = "examples/window-pricing/model.opm.json";
const codes = (model: Model, readSchema?: (f: string) => unknown) => validate(model, { readSchema }).map((d) => d.code);

test("the example model has no errors or warnings", () => {
  const { errors } = check(EXAMPLE, fs.readFileSync(EXAMPLE, "utf-8"));
  assert.deepEqual(errors.filter((e) => e.severity !== "info"), []);
});

test("unknown references are reported with their path", () => {
  const d = validate({ objects: { a: {} }, processes: { p: { requires: ["missing"], yields: ["a"] } } });
  assert.equal(d[0].code, "unknown-object");
  assert.deepEqual(d[0].path, ["processes", "p", "requires", 0]);
});

test("a process that transforms nothing is an error", () => {
  assert.ok(codes({ objects: { m: { role: "module" } }, processes: { p: { requires: ["m"] } } }).includes("no-transformation"));
});

test("an in-zoomed process may leave the transformation to its subprocesses", () => {
  const model: Model = { objects: { a: {} }, processes: { p: { zoomsInto: ["q"] }, q: { yields: ["a"] } } };
  assert.ok(!codes(model).includes("no-transformation"));
});

test("states must exist on the object", () => {
  const model: Model = {
    objects: { a: { states: ["open", "closed"] }, b: {} },
    processes: { p: { changes: [{ object: "a", from: "open", to: "gone" }], conditions: [{ object: "b", state: "x" }] } },
  };
  const c = codes(model);
  assert.ok(c.includes("unknown-state"));
  assert.ok(c.includes("no-states"));
});

test("an enabler cannot be transformed by the same process", () => {
  assert.ok(codes({ objects: { a: {} }, processes: { p: { requires: ["a"], consumes: ["a"] } } }).includes("enabler-transformed"));
});

test("duplicate identifiers, zoom cycles and two parents are errors", () => {
  const model: Model = {
    objects: { x: {}, p: {} },
    processes: { p: { zoomsInto: ["q"], yields: ["x"] }, q: { zoomsInto: ["p"], yields: ["x"] }, r: { zoomsInto: ["q"], yields: ["x"] } },
  };
  const c = codes(model);
  assert.ok(c.includes("duplicate-id"));
  assert.ok(c.includes("cycle"));
  assert.ok(c.includes("two-parents"));
});

test("schema references and states are checked against the JSON Schema", () => {
  const doc = { $defs: { r: { properties: { status: { enum: ["ok", "failed"] } } } } };
  const read = (f: string) => (f === "s.json" ? doc : undefined);
  const base = { processes: { p: { yields: ["a", "b", "c"] } } };
  assert.ok(codes({ ...base, objects: { a: { schema: "s.json#/$defs/r", states: ["ok", "lost"] }, b: {}, c: {} } }, read).includes("state-not-in-schema"));
  assert.ok(codes({ ...base, objects: { a: { schema: "s.json#/$defs/none" }, b: {}, c: {} } }, read).includes("schema-pointer"));
  assert.ok(codes({ ...base, objects: { a: { schema: "other.json#/$defs/r" }, b: {}, c: {} } }, read).includes("schema-file"));
});

test("enum values are collected through local references", () => {
  const doc = { $defs: { a: { items: { $ref: "#/$defs/b" } }, b: { enum: ["x", "y"] } } };
  assert.deepEqual([...collectEnumValues(doc, doc.$defs.a)].sort(), ["x", "y"]);
});

test("the format schema rejects unknown fields and bad identifiers", () => {
  const errors = structureErrors({ objects: { Bad: {} }, processes: { p: { produces: ["a"] } } });
  assert.ok(errors.length >= 2);
});

test("locate finds the value, or the property name for objects", () => {
  const text = '{"objects": {"a": {"states": ["x", "y"]}}}';
  const { tree } = check("m.opm.json", text, false);
  assert.equal(text.substr(locate(tree, ["objects", "a", "states", 1]).offset, 3), '"y"');
  assert.equal(text.substr(locate(tree, ["objects", "a"]).offset, 3), '"a"');
});

test("notes are allowed on things and on every kind of link entry", () => {
  const model = {
    objects: { a: { note: "x", consistsOf: [{ object: "b", note: "y" }], isA: { object: "c", note: "z" } }, b: {}, c: {} },
    processes: {
      p: { note: "n", requires: [{ object: "a", state: "s", note: "n" }], yields: ["b"], invokes: [{ process: "q", note: "n" }],
        conditions: [{ object: "c", note: "n" }], changes: [{ object: "b", to: "s", note: "n" }] },
      q: { affects: [{ object: "a", note: "n" }], isA: { process: "p", note: "n" } },
    },
  };
  assert.deepEqual(structureErrors(model), []);
  assert.ok(structureErrors({ processes: { p: { invokes: [{ object: "q" }] } } }).length > 0, "a process link names its target with process");
});

test("an unknown target in object form is reported at its key", () => {
  const d = validate({ objects: { a: {} }, processes: { p: { yields: ["a"], invokes: [{ process: "missing", note: "n" }] } } });
  const unknown = d.find((x) => x.code === "unknown-process")!;
  assert.deepEqual(unknown.path, ["processes", "p", "invokes", 0, "process"]);
});

test("the starter model of the New Model command is valid and has no warnings", () => {
  const text = starterModel(modelName("C:/x/order-flow.opm.json"));
  assert.equal(JSON.parse(text).name, "Order flow");
  const { errors } = check("new.opm.json", text);
  assert.deepEqual(errors.filter((e) => e.severity !== "info"), []);
});

test("Create JSON Schema writes definitions the validator accepts and keeps existing ones", () => {
  const model: Model = {
    name: "M",
    objects: {
      user: { essence: "physical" }, ui: { role: "module" },
      order: { states: ["open", "closed"], consistsOf: ["line"], description: "An order." },
      line: {}, special: { isA: "order" },
    },
    processes: { p: { handledBy: ["user"], requires: ["ui"], consumes: ["line"], yields: ["order"] } },
  };
  assert.deepEqual(dataObjects(model), ["order", "line", "special"]);
  assert.equal(schemaFileFor(model, "dir/m.opm.json"), "m.schema.json");
  const draft = draftSchema(model, "m.schema.json");
  const schema = JSON.parse(draft.text);
  assert.deepEqual(schema.$defs.order.properties, { state: { enum: ["open", "closed"] }, line: { $ref: "#/$defs/line" } });
  assert.deepEqual(schema.$defs.special.allOf, [{ $ref: "#/$defs/order" }]);
  const linked: Model = { ...model, objects: Object.fromEntries(Object.entries(model.objects!).map(([id, o]) => [id, draft.links[id] ? { ...o, schema: draft.links[id] } : o])) };
  assert.deepEqual(validate(linked, { readSchema: () => schema }).filter((d) => d.severity !== "info"), []);

  const kept = draftSchema(model, "m.schema.json", '{\n  "$defs": {\n    "order": { "type": "string" }\n  }\n}\n');
  assert.deepEqual(kept.added, ["line", "special"]);
  assert.deepEqual(JSON.parse(kept.text).$defs.order, { type: "string" });
  assert.equal(Object.keys(kept.links).length, 3);
});

/** A small model for stories: an agent, two modules, and a process zoomed into one subprocess. */
const storyBase = (stories: Model["stories"]): Model => ({
  objects: {
    clerk: { essence: "physical" }, desk: { role: "module" }, checker: { role: "module" },
    order: { states: ["open", "closed"] }, receipt: {},
  },
  processes: {
    ordering: { handledBy: ["clerk"], requires: ["desk"], zoomsInto: ["placing"] },
    placing: { requires: ["desk"], yields: ["order"] },
    closing: { requires: ["checker"], changes: [{ object: "order", from: "open", to: "closed" }], yields: ["receipt"] },
  },
  stories,
});
const validStory = (): NonNullable<Model["stories"]>[string] => ({
  story: "As a clerk I want to place an order, so that it can be closed.",
  lanes: ["clerk", "desk", "checker"],
  steps: [
    // the clerk handles ordering, the parent of placing
    { lane: "clerk", does: "Fills in the order form.", process: "placing", handsOver: { object: "order", state: "open", to: "desk" } },
    // ordering yields the order through its subprocess placing
    { lane: "desk", does: "Forwards the order.", process: "ordering", handsOver: { object: "order", to: "checker" } },
    { lane: "checker", does: "Closes the order.", process: "closing", waits: "one day", problem: "Nobody is told when it is closed." },
  ],
  doneWhen: ["The order is closed."],
});
const storyDiagnostics = (story: NonNullable<Model["stories"]>[string]) =>
  validate(storyBase({ s: story })).filter((d) => d.path[0] === "stories").map((d) => ({ severity: d.severity, code: d.code, path: d.path.slice(2) }));

test("a story whose lanes, processes and objects agree with the model passes without warnings", () => {
  assert.deepEqual(validate(storyBase({ s: validStory() })), []);
  assert.deepEqual(structureErrors(storyBase({ s: { ...validStory(), title: "Placing", note: "n" } })), []);
});

test("the format schema requires the story sentence, lanes and steps, and lane and does in a step", () => {
  assert.ok(structureErrors(storyBase({ s: { lanes: ["clerk"], steps: [{ lane: "clerk", does: "x" }] } as never })).length > 0);
  assert.ok(structureErrors(storyBase({ s: { ...validStory(), lanes: [] } })).length > 0);
  assert.ok(structureErrors(storyBase({ s: { ...validStory(), steps: [{ lane: "clerk" }] } as never })).length > 0);
  assert.ok(structureErrors(storyBase({ s: { ...validStory(), steps: [{ lane: "clerk", does: "x", handsOver: { object: "order" } }] } as never })).length > 0);
  assert.ok(structureErrors(storyBase({ s: { ...validStory(), actors: [] } as never })).length > 0);
});

test("a lane must be an agent or a module of the model, listed once", () => {
  const s = validStory();
  s.lanes = [...s.lanes, "nobody", "closing", "receipt", "desk"];
  assert.deepEqual(storyDiagnostics(s), [
    { severity: "error", code: "unknown-object", path: ["lanes", 3] },
    { severity: "error", code: "not-an-object", path: ["lanes", 4] },
    { severity: "error", code: "lane-kind", path: ["lanes", 5] },
    { severity: "error", code: "duplicate-lane", path: ["lanes", 6] },
  ]);
});

test("a step's lane and the receiving lane must be lanes of the story", () => {
  const s = validStory();
  s.lanes = ["clerk", "desk"];
  s.steps = s.steps.slice(0, 2);
  const d = storyDiagnostics(s);
  assert.deepEqual(d.filter((x) => x.severity === "error"), [{ severity: "error", code: "lane-not-listed", path: ["steps", 1, "handsOver", "to"] }]);
  s.steps = [{ lane: "checker", does: "x", handsOver: { object: "order", to: "desk" } }, ...s.steps];
  assert.deepEqual(storyDiagnostics(s)[0], { severity: "error", code: "lane-not-listed", path: ["steps", 0, "lane"] });
});

test("a step's process must be a process of the model", () => {
  const s = validStory();
  s.steps[2].process = "archiving";
  assert.deepEqual(storyDiagnostics(s), [{ severity: "error", code: "unknown-process", path: ["steps", 2, "process"] }]);
  s.steps[2].process = "order";
  assert.deepEqual(storyDiagnostics(s), [{ severity: "error", code: "not-a-process", path: ["steps", 2, "process"] }]);
});

test("a handed-over object must exist and have the named state", () => {
  const s = validStory();
  s.steps[0].handsOver = { object: "invoice", to: "desk" };
  assert.deepEqual(storyDiagnostics(s), [{ severity: "error", code: "unknown-object", path: ["steps", 0, "handsOver", "object"] }]);
  s.steps[0].handsOver = { object: "order", state: "lost", to: "desk" };
  assert.deepEqual(storyDiagnostics(s), [{ severity: "error", code: "unknown-state", path: ["steps", 0, "handsOver", "state"] }]);
  s.steps[2].handsOver = { object: "receipt", state: "printed", to: "clerk" };
  assert.ok(storyDiagnostics(s).some((x) => x.code === "no-states" && x.path.join("/") === "steps/2/handsOver/state"));
});

test("a lane with no step is a warning", () => {
  const s = validStory();
  s.steps = s.steps.slice(0, 2);
  assert.deepEqual(storyDiagnostics(s), [{ severity: "warning", code: "empty-lane", path: ["lanes", 2] }]);
});

test("a lane that takes no part in the step's process is a warning, for agents and modules", () => {
  const s = validStory();
  s.steps[2].lane = "clerk";
  s.steps[2].handsOver = { object: "receipt", to: "checker" };
  const d = storyDiagnostics(s);
  assert.ok(d.some((x) => x.code === "lane-not-in-process" && x.path.join("/") === "steps/2/process"), "the clerk does not handle closing");
  const m = validStory();
  m.steps[0].lane = "checker";
  m.steps[2].lane = "desk";
  m.steps[2].handsOver = { object: "receipt", to: "clerk" };
  const codes = storyDiagnostics(m).filter((x) => x.code === "lane-not-in-process").map((x) => x.path[1]);
  assert.deepEqual(codes, [0, 2], "closing and placing do not require these modules");
});

test("a handed-over object that the step's process does not use is a warning", () => {
  const s = validStory();
  s.steps[0].handsOver = { object: "receipt", to: "desk" };
  assert.deepEqual(storyDiagnostics(s), [{ severity: "warning", code: "object-not-in-process", path: ["steps", 0, "handsOver", "object"] }]);
});

test("a story that hands nothing over is a warning", () => {
  const s = validStory();
  s.steps = s.steps.map(({ handsOver: _h, ...rest }) => rest);
  assert.deepEqual(storyDiagnostics(s), [{ severity: "warning", code: "no-hand-over", path: ["steps"] }]);
});

test("P28 capabilities, authorities and deploymentName are validated by schema and semantic rules", () => {
  const validP28: Model = {
    objects: {
      pricer: {
        role: "module",
        deploymentName: "pricing_v1.2.0",
        capabilities: ["can_price_window"],
        owns: ["owns_price_quote"],
      },
      quote: {
        states: ["draft", "final"],
        authority: "owns_price_quote",
      },
    },
    processes: {
      pricingWindow: {
        capability: "can_price_window",
        requires: ["pricer"],
        yields: [{ object: "quote", state: "final" }],
      },
    },
  };
  assert.deepEqual(structureErrors(validP28), []);
  assert.deepEqual(validate(validP28).filter((d) => d.severity !== "info"), []);

  // Schema format checks for capabilityId, authorityId, deploymentName
  assert.ok(structureErrors({ objects: { m: { role: "module", deploymentName: "badName" } } }).length > 0);
  assert.ok(structureErrors({ objects: { m: { role: "module", capabilities: ["price_window"] } } }).length > 0);
  assert.ok(structureErrors({ objects: { m: { role: "module", owns: ["price_quote"] } } }).length > 0);
  assert.ok(structureErrors({ objects: { q: { authority: "quote" } } }).length > 0);
  assert.ok(structureErrors({ processes: { p: { capability: "price_window" } } }).length > 0);

  // Semantic checks: duplicate-authority, missing-capability, p28-not-performer
  const brokenP28: Model = {
    objects: {
      modA: { role: "module", capabilities: ["can_other"], owns: ["owns_quote"] },
      modB: { role: "module", owns: ["owns_quote"] },
      plainObj: { capabilities: ["can_do_x"], deploymentName: "plain_v0.1.0" },
      quote: { authority: "owns_quote" },
    },
    processes: {
      pricing: { capability: "can_price", requires: ["modA"], yields: ["quote"] },
    },
  };
  const diags = validate(brokenP28);
  const brokenCodes = diags.map((d) => d.code);
  assert.ok(brokenCodes.includes("duplicate-authority"), "two modules cannot claim the same authority");
  assert.ok(brokenCodes.includes("missing-capability"), "performer lacks process capability");
  assert.ok(brokenCodes.includes("p28-not-performer"), "plain object is not a module or physical agent");
});
