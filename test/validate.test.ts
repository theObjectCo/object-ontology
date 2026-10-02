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
