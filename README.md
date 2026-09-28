# Object Ontology: OPM models in JSON

A model describes a system with the concepts of OPM (Object-Process Methodology, ISO 19450): objects, processes, object states and the links between them. It is a JSON file with the extension `.opm.json`. Data structures stay in JSON Schema files, and objects point to their definitions.

The package has three parts:

- a validator that checks the structure of the file and the OPM rules, and compares object states with the enums in the referenced JSON Schemas;
- a renderer that produces Mermaid diagrams and OPL sentences, the controlled-English text form of OPM;
- a VS Code extension with a visual editor: the diagram is drawn in ISO 19450 notation, and every change made on it is written back to the JSON file as one undoable edit.

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
| `tagged` | Links with a free-text tag: `[{ "object": "customer", "tag": "is made for" }]` gives "Price Request is made for Customer." |

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

`requires`, `consumes` and `yields` accept an identifier or `{ "object": "snapshot", "state": "valid" }` for a link to one state. A process can also have `essence`, `affiliation`, `consistsOf` and `isA`, with the same meaning as for objects.

### Layout

The optional `layout` section at the end of the file stores the positions that the diagram editor writes when something is moved: view id, thing id, `[x, y]` of the top-left corner.

```json
"layout": {
  "system": { "user": [40, 40], "configuring": [210, 158] }
}
```

A view without an entry is laid out automatically every time it is opened, and opening or scrolling it never changes the file. The first move in a view writes the positions of all its things, so a view is either automatic or manual as a whole. The validator, the renderer and the markdown export ignore the layout, apart from information diagnostics about positions of things that no longer exist.

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

A `*.opm.json` file opens in the diagram editor. **OPM: Open Text Beside** in the editor title bar shows the JSON next to it, and **OPM: Open Diagram Beside** does the reverse from the text editor. The JSON file stays the only source: the editor has no model of its own, each operation is one edit of the text, Ctrl+Z undoes it, and a change typed in the text redraws the diagram.

The canvas shows one view at a time: the system diagram SD, the structure view SB when the model has parts, attributes or generalizations, one diagram per zoomed process (SD1, SD1.1 and so on) and the custom views from `views`. The path in the toolbar and Backspace lead one level up; a double click or Enter on a process opens its zoom and creates an empty one if the process has none. Subprocesses are stacked inside the zoomed process in their order of execution, and a vertical drag changes that order.

Details appear in steps. With nothing selected, only the diagram, the toolbar and a one-line OPL bar are visible. A selection opens a small inspector next to it and dims unrelated things. **More** turns the inspector into a drawer with the identifier, label, description, states, the JSON Schema definition and the classification. The OPL bar expands into a panel with the sentences of the whole view or of the selection; a click on a sentence selects its things.

A link is drawn from the handle of a thing, or from a state box, to another thing. Only targets with an allowed link kind light up, and the menu after the drop lists those kinds with keys 1 to 9:

| From → to | Kinds |
|---|---|
| object → process | requires, consumes, handles, condition, event, effect |
| process → object | yields, effect |
| object → object | consists of, exhibits, is a, tagged |
| process → process | invokes, consists of, is a |

A link that starts or ends in a state box keeps that state. An effect that starts in one state offers the target states in the menu and becomes a `changes` entry.

| Key | Action |
|---|---|
| O, P, S | new object, process, state of the selected object |
| Delete | delete the selection with its links, zoom entries and positions |
| F2 | edit the identifier; every reference follows |
| double click on a label | edit the label in place |
| Ctrl+C, Ctrl+V | copy the selection with the links inside it; pasted identifiers get a number when taken |
| Ctrl+A, Esc | select everything in the view, clear the selection |
| Ctrl+0, Ctrl++, Ctrl+− | fit, zoom in, zoom out |

The ⋯ menu exports the view as PNG (twice the screen resolution, on the theme background) or SVG, exports markdown, saves the selection as a custom view and switches word labels on the links.

The activity bar has an OPM container with two trees: **Model** lists objects with their states and processes with their subprocesses, with error and warning icons, and **Views** lists the views. A click selects the element in the diagram and switches to a view that contains it. **OPM: Find Element** searches by label or identifier. The setting `opm.schemaGlob` (default `**/*.schema.json`) chooses the schema files offered in the drawer.

**OPM: Export Markdown** writes the views, the module table, the state diagrams and the OPL text as `<model>.md` next to the model. The UI of the editor follows the VS Code display language (English or Polish); OPL is always English.

## Development

`npm test` builds the package and runs the tests in `test/`. `npm run typecheck` checks the extension and the webview, which have separate TypeScript configurations. The core in `src/core/` has no dependency on VS Code, so the command line, the extension and the webview share the validator, the OPL text and the edit engine (`src/core/edit.ts`), which turns each editor operation into a minimal change of the JSON text.

`npm run shots` runs the diagram editor in headless Chrome with a stand-in for the VS Code API (`test/harness/`), goes through the main interactions and saves screenshots in `dist/shots`. It needs Chrome at the default Windows path or in the `CHROME` environment variable.
