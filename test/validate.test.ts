import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import { check, locate, structureErrors } from "../src/core/load";
import { Model } from "../src/core/model";
import { collectEnumValues, validate } from "../src/core/validate";

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
