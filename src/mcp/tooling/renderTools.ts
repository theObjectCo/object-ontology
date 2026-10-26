import { dsmMarkdown } from "../../core/methods/dsm";
import { flowMarkdown } from "../../core/methods/flow";
import { idef0Markdown } from "../../core/methods/idef0";
import { METHODS, MethodId, documentWithMethods } from "../../core/methods/index";
import { sipocMarkdown } from "../../core/methods/sipoc";
import { oplAbout, oplSentences, sentenceText } from "../../core/opl";
import { str, thingOrFail } from "./arguments";
import { Tool } from "./contracts";
import { MODEL_FILE, loadClean, loadModel } from "./modelFiles";
import { ID_ARG, PATH, READ } from "./schemas";
import * as fs from "fs";

export const renderTools: Tool[] = [

  {
    name: "opm_opl",
    title: "OPL sentences",
    ...READ,
    description: `Gives the OPL sentences (Object-Process Language, the controlled-English text of ISO 19450) of a whole model or of some things in it.

Parameters:
- path: absolute path of the *.opm.json file.
- ids (optional): identifiers of objects or processes; only the sentences that mention any of them are returned.

Returns plain text, one sentence per line, e.g. "Pricing requires Pricing Module, valid Snapshot, Customer and Department Data."

Example: {"path": "C:/work/model.opm.json", "ids": ["pricing"]}`,
    inputSchema: {
      type: "object",
      properties: { path: PATH, ids: { type: "array", items: { type: "string" }, description: "Optional: only sentences about these things." } },
      required: ["path"],
      additionalProperties: false,
    },
    handler: (args) => {
      const { model } = loadModel(args.path);
      const ids = (args.ids as string[] | undefined) ?? undefined;
      if (ids) for (const id of ids) thingOrFail(model, id);
      const sentences = ids ? oplAbout(model, ids) : oplSentences(model);
      return sentences.map(sentenceText).join("\n") || "No OPL sentences.";
    },
  },

  {
    name: "opm_render",
    title: "Render the markdown document",
    ...READ,
    description: `Renders the markdown document of a model, the same as "opm render": Mermaid diagrams of every view, the module table, state diagrams, OPL, the user stories, then the method sections (IDEF0, SIPOC, N² matrix, flow). The model must have no errors.

Parameters:
- path: absolute path of the *.opm.json file.
- methods (optional): which method sections to append, a subset of ["idef0", "sipoc", "dsm", "flow"]; [] for none; all four when omitted.
- write (optional, default false): when true, writes the document to <model>.md next to the model file and returns only the path, instead of returning the text.

Returns the markdown text, or a line naming the written file.

Example: {"path": "C:/work/model.opm.json", "methods": []}`,
    inputSchema: {
      type: "object",
      properties: {
        path: PATH,
        methods: { type: "array", items: { type: "string", enum: METHODS }, description: "Method sections to append; [] for none; all when omitted." },
        write: { type: "boolean", description: "Write <model>.md next to the model instead of returning the text." },
      },
      required: ["path"],
      additionalProperties: false,
    },
    handler: (args) => {
      const { file, model } = loadClean(args.path);
      const methods = (args.methods as MethodId[] | undefined) ?? METHODS;
      const text = documentWithMethods(model, METHODS.filter((m) => methods.includes(m)));
      if (args.write !== true) return text;
      const out = file.replace(MODEL_FILE, "") + ".md";
      fs.writeFileSync(out, text, "utf-8");
      return `Written ${out} (${text.length} characters).`;
    },
  },

  {
    name: "opm_method",
    title: "IDEF0, SIPOC, N² or flow",
    ...READ,
    description: `Gives one of the four views computed from the links of a model, as markdown. The model must have no errors.

Parameters:
- path: absolute path of the *.opm.json file.
- method: "idef0" (ICOM boxes of the top-level and zoomed processes with the A0 decomposition), "sipoc" (suppliers, inputs, process, outputs, customers of each top-level process), "dsm" (N² matrix of modules and agents with cycles), "flow" (swimlane flow of each zoomed process).
- process (optional): one process instead of all; not used by "dsm".
- agents (optional, default true): for "dsm", whether agents get rows and columns.

Returns markdown text.

Example: {"path": "C:/work/model.opm.json", "method": "idef0", "process": "pricing"}`,
    inputSchema: {
      type: "object",
      properties: {
        path: PATH,
        method: { type: "string", enum: METHODS, description: "Which method." },
        process: ID_ARG("Optional: one process instead of all."),
        agents: { type: "boolean", description: "For dsm: include agents (default true)." },
      },
      required: ["path", "method"],
      additionalProperties: false,
    },
    handler: (args) => {
      const { model } = loadClean(args.path);
      const pid = str(args, "process");
      if (pid) thingOrFail(model, pid, "process");
      const ids = pid ? [pid] : undefined;
      const lines = args.method === "idef0" ? idef0Markdown(model, ids)
        : args.method === "sipoc" ? sipocMarkdown(model, ids)
        : args.method === "flow" ? flowMarkdown(model, ids)
        : dsmMarkdown(model, { agents: args.agents !== false });
      return lines.join("\n").trimEnd() || `Nothing to show: ${args.method === "flow" ? "no process has subprocesses" : "no process fits"}${pid ? ` (${pid})` : ""}.`;
    },
  }
];
