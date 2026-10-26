import { essence, label, objects, processes } from "../../core/model";
import { stories, storyTitle } from "../../core/stories";
import { listViews } from "../../core/viewmodel";
import { need } from "./arguments";
import { Tool, ToolError } from "./contracts";
import { count, summaryLine } from "./diagnostics";
import { load, loadModel, modelFile, walkModels } from "./modelFiles";
import { zoomTree } from "./modelViews";
import { PATH, READ } from "./schemas";
import * as fs from "fs";
import * as path from "path";

export const modelTools: Tool[] = [

  {
    name: "opm_list_models",
    title: "List OPM models",
    ...READ,
    description: `Lists every OPM model file (*.opm.json) under a folder, recursively, skipping node_modules, dist, out and .git.

Parameters:
- root: absolute path of the folder to search.

Returns a JSON array, one entry per file: path, name, the counts of objects, modules, agents, processes, views and stories, and the counts of errors and warnings the validator finds. A file that is not valid JSON has "error" instead of the counts.

Example: {"root": "C:/work/project"} -> [{"path": "C:/work/project/model.opm.json", "name": "Window pricing", "objects": 22, "modules": 5, ...}]`,
    inputSchema: { type: "object", properties: { root: { type: "string", description: "Absolute path of the folder to search." } }, required: ["root"], additionalProperties: false },
    handler: (args) => {
      const root = need(args, "root", "the absolute path of a folder");
      if (!path.isAbsolute(root)) throw new ToolError(`"${root}" is not an absolute path.`);
      if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) throw new ToolError(`${root} is not a folder.`);
      return walkModels(path.resolve(root)).map((file) => {
        const loaded = load(file);
        if (!loaded.model) return { path: file, error: "not valid JSON" };
        const m = loaded.model;
        const objs = Object.entries(objects(m));
        return {
          path: file,
          name: m.name ?? path.basename(file),
          objects: objs.length,
          modules: objs.filter(([, o]) => o.role === "module").length,
          agents: objs.filter(([, o]) => o.role !== "module" && essence(o) === "physical").length,
          processes: Object.keys(processes(m)).length,
          views: Object.keys(m.views ?? {}).length,
          stories: Object.keys(stories(m)).length,
          errors: count(loaded.diagnostics, "error"),
          warnings: count(loaded.diagnostics, "warning"),
        };
      });
    },
  },

  {
    name: "opm_validate",
    title: "Validate an OPM model",
    ...READ,
    description: `Validates one OPM model: JSON syntax, the format schema, and the OPM rules (references, states, transformations, zoom cycles, JSON Schema enums, user stories, P28 capabilities and authorities).

Parameters:
- path: absolute path of the *.opm.json file.

Returns JSON: "summary" (one line, e.g. "1 error, 2 warnings, 0 infos." or "OK: no errors or warnings."), the counts, and "diagnostics": a list of {severity, code, message, path, element, line, column}. "path" is the JSON path of the value inside the file, e.g. ["processes", "pricing", "requires", 0]; line and column are 1-based.

Example: {"path": "C:/work/model.opm.json"}`,
    inputSchema: { type: "object", properties: { path: PATH }, required: ["path"], additionalProperties: false },
    handler: (args) => {
      const loaded = load(modelFile(args.path));
      const d = loaded.diagnostics;
      return { file: loaded.file, summary: summaryLine(d), errors: count(d, "error"), warnings: count(d, "warning"), infos: count(d, "info"), diagnostics: d };
    },
  },

  {
    name: "opm_summary",
    title: "Summarise an OPM model",
    ...READ,
    description: `Gives the outline of one OPM model: what is in it, by identifier and label, without the links.

Parameters:
- path: absolute path of the *.opm.json file.

Returns JSON with: name, description, agents (physical objects), modules (objects with role "module", plus deploymentName, capabilities and owns where set), objects (the rest, with states, essence, affiliation, schema and authority where set), processes as a zoom tree (each process with its capability and "subprocesses" in execution order), views (generated and custom: id, kind, code such as SD1.2, title), stories (id, title, lanes, number of steps) and the validation summary line. Use opm_get for the links of one thing.

Example: {"path": "C:/work/model.opm.json"}`,
    inputSchema: { type: "object", properties: { path: PATH }, required: ["path"], additionalProperties: false },
    handler: (args) => {
      const { file, model, diagnostics } = loadModel(args.path);
      const objs = Object.entries(objects(model));
      const brief = (id: string) => ({ id, label: label(model, id) });
      return {
        file,
        name: model.name,
        ...(model.description ? { description: model.description } : {}),
        agents: objs.filter(([, o]) => o.role !== "module" && essence(o) === "physical").map(([id, o]) => ({
          ...brief(id),
          ...(o.capabilities?.length ? { capabilities: o.capabilities } : {}),
          ...(o.owns?.length ? { owns: o.owns } : {}),
        })),
        modules: objs.filter(([, o]) => o.role === "module").map(([id, o]) => ({
          ...brief(id),
          ...(o.deploymentName ? { deploymentName: o.deploymentName } : {}),
          ...(o.capabilities?.length ? { capabilities: o.capabilities } : {}),
          ...(o.owns?.length ? { owns: o.owns } : {}),
        })),
        objects: objs.filter(([, o]) => o.role !== "module" && essence(o) !== "physical").map(([id, o]) => ({
          ...brief(id),
          ...(o.states ? { states: o.states } : {}),
          ...(o.affiliation ? { affiliation: o.affiliation } : {}),
          ...(o.schema ? { schema: o.schema } : {}),
          ...(o.authority ? { authority: o.authority } : {}),
        })),
        processes: zoomTree(model),
        views: listViews(model).map((v) => ({ id: v.id, kind: v.kind, code: v.code, title: v.title, ...(v.process ? { process: v.process } : {}) })),
        stories: Object.entries(stories(model)).map(([id, s]) => ({ id, title: storyTitle(id, s), lanes: s.lanes, steps: (s.steps ?? []).length })),
        summary: summaryLine(diagnostics),
      };
    },
  }
];
