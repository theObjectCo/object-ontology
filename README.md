# Object Ontology: OPM models in JSON

A model describes a system with the concepts of OPM (Object-Process Methodology, ISO 19450): objects, processes, object states and the links between them. It is a JSON file with the extension `.opm.json`. Data structures stay in JSON Schema files, and objects point to their definitions.

The package has three parts:

- a validator that checks the structure of the file and the OPM rules, and compares object states with the enums in the referenced JSON Schemas;
- a renderer that produces Mermaid diagrams and OPL sentences, the controlled-English text form of OPM;
- a VS Code extension that shows errors while the file is edited and opens a live preview of the diagrams.

The `opm` command runs the validator and the renderer outside the editor, for example in CI.

## Model format

```json
{
  "$schema": "../../schema/opm-model.schema.json",
  "name": "Window configuration and pricing",
  "objects": {
    "pricingModule": { "role": "module" },
    "snapshot": { "schema": "contracts.schema.json#/$defs/snapshot", "states": ["valid", "expired"] },
    "priceRequest": {},
    "priceResult": { "states": ["complete", "approximate", "partial", "rejected"] }
  },
  "processes": {
    "pricing": {
      "requires": ["pricingModule", "snapshot"],
      "consumes": ["priceRequest"],
      "yields": ["priceResult"],
      "conditions": [{ "object": "snapshot", "state": "valid" }]
    }
  }
}
```

Identifiers are camelCase. The label is derived from the identifier (`priceResult` becomes Price Result, `ui` becomes UI) unless `label` sets another one.

An object has these optional fields:

| Field | Meaning |
|---|---|
| `role: "module"` | A part of the system that processes require. A module has no other properties: the processes it takes part in describe what it takes and gives. |
| `essence` | `informatical` (default) or `physical`. Agents are physical. |
| `affiliation` | `systemic` (default) or `environmental` for things outside the system, drawn with a dashed border. |
| `states` | At least two states. |
| `schema` | `file#/json/pointer` of the JSON Schema definition, relative to the model file. |
| `consistsOf`, `exhibits`, `isA` | Aggregation, exhibition and generalization. |

A process lists its links. Each link kind has one OPL sentence and one diagram notation:

| Field | OPL sentence | Diagram |
|---|---|---|
| `handledBy` | User handles Configuring. | `--o` labeled agent |
| `requires` | Pricing requires Pricing Module. | `--o` |
| `consumes` | Pricing consumes Price Request. | arrow into the process |
| `yields` | Pricing yields Price Result. | arrow out of the process |
| `affects` | Applying affects Configuration. | two-way arrow |
| `changes` | Expiring changes Snapshot from valid to expired. | arrows labeled with both states |
| `conditions` | Pricing occurs if Snapshot is valid, otherwise Pricing is skipped. | dotted arrow labeled c |
| `events` | Department Data initiates Context Updating. | dotted arrow labeled e |
| `zoomsInto` | Pricing zooms into Product Pricing and Transport Pricing, in that sequence. | subprocesses inside the process, numbered in order |
| `invokes` | Validating invokes Applying. | dotted arrow labeled invokes |

Objects are rectangles with their states in italics, modules have a thicker border, and processes are rounded shapes. Mermaid has no ellipse and no OPM link symbols, so these shapes and arrows approximate the ISO 19450 notation.

## Checks

The format schema checks field names, types and identifiers. VS Code applies it to every `*.opm.json` file, with completion and hover help. The validator then checks the meaning:

- every reference points to an object or a process of the right kind;
- every process transforms at least one object (consumes, yields, affects or changes it), itself or through its subprocesses;
- an object required or handled by a process is not also transformed by it;
- named states exist on the object, and a state change goes between two different states;
- a subprocess has one parent, and there are no cycles in `zoomsInto`, `consistsOf` or `isA`;
- a `schema` reference points to an existing file and definition, and the object's states occur in an enum of that definition.

Warnings cover objects linked to nothing, agents that are not physical, modules that a process transforms, and a process that consumes and yields the same object.

## Generated views

- a system view with the top-level processes, carrying the links of their subprocesses;
- a structure view with parts, attributes and generalizations;
- a view for every process with `zoomsInto`;
- the views listed under `views`, either one process or a list of `things`;
- a state diagram for every object with states, with transitions taken from `changes`;
- a module table: what each module performs, takes, gives and changes, derived from the processes that require it;
- the OPL text of the whole model.

## Command line

```
npm install
npm run build
node dist/cli.js validate examples/window-pricing/model.opm.json
node dist/cli.js render examples/window-pricing/model.opm.json -o examples/window-pricing/model.md
node dist/cli.js opl examples/window-pricing/model.opm.json
```

`validate` prints `file:line:column: severity [code] message` and exits with code 1 when there are errors. `render` writes a markdown document whose Mermaid diagrams GitHub and VS Code display without extra tools. [examples/window-pricing/model.md](examples/window-pricing/model.md) is the output for the example model.

## VS Code extension

`npm run package` builds `dist/object-ontology.vsix`. Install it with:

```
code --install-extension dist/object-ontology.vsix
```

With the extension installed, a `*.opm.json` file gets completion from the format schema, OPM errors in the Problems panel as it is edited, and two commands in the editor title bar and the command palette:

- **OPM: Open Preview** opens the views, the module table, the state diagrams and the OPL text next to the editor and updates them while typing;
- **OPM: Export Markdown** writes the same content as `<model>.md` next to the model.

The preview loads Mermaid from the extension and needs no network access.

## Development

`npm test` builds the package and runs the tests in `test/`. `npm run typecheck` runs the TypeScript compiler. The core in `src/core/` has no dependency on VS Code, so the command line and the extension share the same validator and renderer.
