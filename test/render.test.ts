import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import { Model, humanize } from "../src/core/model";
import { markdown, moduleSummaries, opl, processView, stateDiagrams, systemView, views } from "../src/core/render";
import { handOverTarget } from "../src/core/stories";

const model = JSON.parse(fs.readFileSync("examples/window-pricing/model.opm.json", "utf-8")) as Model;

test("labels come from identifiers", () => {
  assert.equal(humanize("priceResult"), "Price Result");
  assert.equal(humanize("ui"), "UI");
  assert.equal(humanize("erpCustomer"), "ERP Customer");
});

test("OPL follows the ISO 19450 sentence patterns", () => {
  const text = opl(model);
  for (const s of [
    "User is physical.",
    "Price Result can be complete, approximate, partial or rejected.",
    "Snapshot consists of BOM and Cost Drivers.",
    "User handles Configuring.",
    "Pricing requires Pricing Module, Snapshot, Customer and Department Data.",
    "Pricing consumes Price Request.",
    "Applying changes Decision from passed to applied.",
    "Pricing occurs if Snapshot is valid, otherwise Pricing is skipped.",
    "Department Data initiates Context Updating.",
    "Pricing zooms into Product Pricing, Transport Pricing and Lead Time Estimating, in that sequence.",
  ]) assert.ok(text.includes(s), s);
});

test("the system view shows top-level processes with the links of their subprocesses", () => {
  const m = systemView(model).mermaid;
  assert.ok(m.startsWith("flowchart LR"));
  assert.ok(m.includes('p_configuring(["Configuring"]):::process'));
  assert.ok(!m.includes("p_proposing("), "subprocesses are not drawn in the system view");
  assert.ok(m.includes("p_configuring --> o_changeProposal"), "link migrated from Proposing");
  assert.ok(m.includes("o_generator --o p_freezing"));
  assert.ok(m.includes("class o_customer,o_departmentData environmental"));
  assert.ok(!m.includes("consists of"), "structure has its own view");
  assert.ok(!m.includes("o_hash["), "objects without process links are left to the structure view");
});

test("the structure view holds parts, attributes and generalizations", () => {
  const m = views(model).find((v) => v.id === "structure")!.mermaid;
  assert.ok(m.includes("o_snapshot ---|consists of| o_bom"));
  assert.ok(m.includes("o_snapshot ---|exhibits| o_hash"));
  assert.ok(!m.includes("p_"), "no processes in the structure view");
});

test("a process view draws the subprocesses in sequence inside the process", () => {
  const m = processView(model, "pricing").mermaid;
  assert.ok(m.includes('subgraph p_pricing["Pricing"]'));
  assert.ok(m.includes("p_productPricing ~~~ p_transportPricing"));
  assert.ok(m.includes('p_productPricing(["1 · Product Pricing"])'));
  assert.ok(m.includes("o_priceRequest --> p_pricing"));
  assert.ok(m.includes('o_snapshot -.->|"c: valid"| p_pricing'));
});

test("views include the system, every in-zoomed process and the listed views", () => {
  assert.deepEqual(views(model).map((v) => v.id), ["system", "structure", "configuring", "pricing", "snapshotLifecycle"]);
});

test("state diagrams take transitions from changes links", () => {
  const snapshot = stateDiagrams(model).find((v) => v.id === "states-snapshot")!;
  assert.ok(snapshot.mermaid.includes("s0 --> s1 : Expiring"));
});

test("module summaries are derived from the processes that require the module", () => {
  const pricing = moduleSummaries(model).find((m) => m.module === "pricingModule")!;
  assert.deepEqual(pricing.performs, ["pricing"]);
  assert.ok(pricing.takes.includes("priceRequest"));
  assert.deepEqual(pricing.gives, ["priceResult"]);
});

test("markdown contains every view and the OPL section", () => {
  const md = markdown(model);
  assert.equal((md.match(/```mermaid/g) ?? []).length, views(model).length + stateDiagrams(model).length);
  assert.ok(md.includes("## OPL"));
  assert.ok(md.includes("| Pricing Module | Pricing |"));
});

test("a user story is rendered as a makigami table with labels, hand-overs and red cards", () => {
  const m: Model = {
    objects: { clerk: { essence: "physical" }, orderDesk: { role: "module", label: "Desk | front" }, order: { states: ["open", "closed"] } },
    processes: { placing: { handledBy: ["clerk"], requires: ["orderDesk"], yields: ["order"] } },
    stories: {
      placeAnOrder: {
        story: "As a clerk I want to place an order.",
        lanes: ["clerk", "orderDesk"],
        steps: [
          { lane: "clerk", does: "Fills in the form.", process: "placing", handsOver: { object: "order", state: "open", to: "orderDesk", note: "skipped" } },
          { lane: "orderDesk", does: "Stores the order.", waits: "one day", problem: "Two clerks can\nopen one order.", note: "skipped" },
        ],
        doneWhen: ["The order is stored."],
        note: "skipped",
      },
    },
  };
  const md = markdown(m);
  const section = md.slice(md.indexOf("## User stories"));
  assert.ok(md.indexOf("## OPL") < md.indexOf("## User stories"), "stories come after the existing sections");
  assert.deepEqual(section.split("\n").slice(0, 10), [
    "## User stories",
    "",
    "### Place An Order",
    "",
    "As a clerk I want to place an order.",
    "",
    "| Clerk | Desk \\| front | Hands over | Waits | Problem |",
    "|---|---|---|---|---|",
    "| Fills in the form. *(Placing)* |  | Order (open) → Desk \\| front |  |  |",
    "|  | Stores the order. |  | one day | 🟥 Two clerks can<br>open one order. |",
  ]);
  assert.ok(section.includes("Done when:\n\n- The order is stored."));
  assert.ok(!section.includes("skipped"), "notes are skipped");
  assert.ok(!opl(m).some((s) => s.includes("Fills in")), "OPL is unchanged");
  assert.ok(!markdown({ objects: { a: {} } }).includes("## User stories"), "no section without stories");
});

test("a hand-over lands on the next step of the receiving lane, or on that lane in the next column", () => {
  const story = {
    story: "s", lanes: ["a", "b"],
    steps: [
      { lane: "a", does: "1", handsOver: { object: "x", to: "b" } },
      { lane: "a", does: "2" },
      { lane: "b", does: "3", handsOver: { object: "x", to: "a" } },
    ],
  };
  assert.deepEqual(handOverTarget(story, 0), { step: 2, column: 2 });
  assert.deepEqual(handOverTarget(story, 2), { column: 3 }, "no later step of a: the next column, past the last step");
  assert.equal(handOverTarget(story, 1), undefined);
});

test("markdown module table includes Deployment, Capabilities and Owns columns when P28 fields are present", () => {
  const p28Model: Model = {
    name: "P28 Example",
    objects: {
      pricingModule: {
        role: "module",
        deploymentName: "pricing_v1.2.0",
        capabilities: ["can_price"],
        owns: ["owns_price_result"],
      },
      priceRequest: {},
      priceResult: { authority: "owns_price_result" },
    },
    processes: {
      pricing: {
        capability: "can_price",
        requires: ["pricingModule"],
        consumes: ["priceRequest"],
        yields: ["priceResult"],
      },
    },
  };
  const md = markdown(p28Model);
  assert.ok(md.includes("| Module | Deployment | Capabilities | Owns | Performs | Takes | Gives | Changes |"));
  assert.ok(md.includes("| Pricing Module | `pricing_v1.2.0` | `can_price` | `owns_price_result` | Pricing | Price Request | Price Result | none |"));
});
