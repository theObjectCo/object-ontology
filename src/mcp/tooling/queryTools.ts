import { editorLinks, thingKind } from "../../core/links";
import { givenBy, performers, usedBy } from "../../core/methods/common";
import { dsm } from "../../core/methods/dsm";
import { descendants, essence, label, objects, parents, processes } from "../../core/model";
import { oplAbout, sentenceText } from "../../core/opl";
import { stories, storyTitle } from "../../core/stories";
import { viewsContaining } from "../../core/viewmodel";
import { didYouMean, need, thingOrFail } from "./arguments";
import { Tool, ToolError } from "./contracts";
import { linkInfo } from "./linkSupport";
import { loadModel } from "./modelFiles";
import { storyLanes, storyUses } from "./modelViews";
import { ID_ARG, PATH, READ } from "./schemas";

export const queryTools: Tool[] = [

  {
    name: "opm_get",
    title: "Get one thing with its links",
    ...READ,
    description: `Gives everything about one object, process, story or custom view of a model.

Parameters:
- path: absolute path of the *.opm.json file.
- id: identifier of an object, a process, a story or a custom view.

For an object or a process, returns JSON with: kind, label, "definition" (the JSON entry as written, notes included), "outgoing" (links stored on this thing), "incoming" (links stored on other things that point at it), for a process "parent" and "subprocesses" (zoomsInto), "stories" (where it is a lane, a step's lane or process, handed over or receiving), "views" (ids of the views that show it), "opl" (its OPL sentences) and the diagnostics about it.
A link is {kind, owner, target, state?, fromState?, toState?, tag?, note?}: kind is the field of the format (handledBy, requires, consumes, yields, affects, changes, conditions, events, invokes, consistsOf, exhibits, isA, tagged), owner is the thing whose field holds it, target is what it points at. So "which processes require snapshot" is incoming with kind "requires".
For a story or a view, returns its definition and the diagnostics inside it.

Example: {"path": "C:/work/model.opm.json", "id": "snapshot"} -> {"kind": "object", "incoming": [{"kind": "yields", "owner": "freezing", "target": "snapshot"}, ...]}`,
    inputSchema: { type: "object", properties: { path: PATH, id: ID_ARG("Identifier of an object, process, story or custom view.") }, required: ["path", "id"], additionalProperties: false },
    handler: (args) => {
      const { model, diagnostics } = loadModel(args.path);
      const id = need(args, "id", "an identifier");
      const kind = thingKind(model, id);
      if (kind) {
        const links = editorLinks(model).map(linkInfo);
        const def = kind === "object" ? objects(model)[id] : processes(model)[id];
        const parent = kind === "process" ? parents(model).get(id) : undefined;
        return {
          id,
          kind: kind === "object" && def && (def as { role?: string }).role === "module" ? "module" : kind === "object" && essence(def) === "physical" ? "agent" : kind,
          label: label(model, id),
          definition: def,
          outgoing: links.filter((l) => l.owner === id),
          incoming: links.filter((l) => l.target === id && l.owner !== id),
          ...(kind === "process" ? { parent: parent ?? null, subprocesses: processes(model)[id].zoomsInto ?? [] } : {}),
          stories: storyUses(model, id),
          views: viewsContaining(model, id),
          opl: oplAbout(model, [id]).map(sentenceText),
          diagnostics: diagnostics.filter((d) => d.element === id),
        };
      }
      if (stories(model)[id]) {
        return { id, kind: "story", title: storyTitle(id, stories(model)[id]), definition: stories(model)[id], diagnostics: diagnostics.filter((d) => d.path[0] === "stories" && d.path[1] === id) };
      }
      if (model.views?.[id]) {
        return { id, kind: "view", definition: model.views[id], diagnostics: diagnostics.filter((d) => d.path[0] === "views" && d.path[1] === id) };
      }
      throw new ToolError(`Nothing called "${id}" in the model.${didYouMean(model, id)}`);
    },
  },

  {
    name: "opm_query",
    title: "Ask a question about a model",
    ...READ,
    description: `Answers one of four questions about a model.

Parameters:
- path: absolute path of the *.opm.json file.
- question: one of
  - "modulesOfProcess" (needs "process"): the modules a process requires, itself or through its subprocesses at every depth (zoomsInto), each with the processes that require it.
  - "processesOfObject" (needs "object"): every process that links to the object, with the link kind (handledBy, requires, consumes, yields, affects, changes, conditions, events) and the states.
  - "exchange" (needs "from" and "to", modules or agents): the N² matrix cell, i.e. the objects that processes performed by "from" yield, change or affect and processes performed by "to" take in, with the pair of processes for each; also the reverse cell and whether the two are in a cycle.
  - "storyLanes" (needs "story"): the lanes of a user story with their kind (agent or module), their steps, what each lane hands over and what it receives.

Returns JSON.

Examples: {"path": "C:/work/model.opm.json", "question": "modulesOfProcess", "process": "pricing"}; {"path": "...", "question": "exchange", "from": "generator", "to": "pricingModule"}`,
    inputSchema: {
      type: "object",
      properties: {
        path: PATH,
        question: { type: "string", enum: ["modulesOfProcess", "processesOfObject", "exchange", "storyLanes"], description: "Which question to answer." },
        process: ID_ARG("Process id, for modulesOfProcess."),
        object: ID_ARG("Object id, for processesOfObject."),
        from: ID_ARG("Giving module or agent, for exchange."),
        to: ID_ARG("Receiving module or agent, for exchange."),
        story: ID_ARG("Story id, for storyLanes."),
      },
      required: ["path", "question"],
      additionalProperties: false,
    },
    handler: (args) => {
      const { model } = loadModel(args.path);
      switch (args.question) {
        case "modulesOfProcess": {
          const pid = need(args, "process", "the process to ask about");
          thingOrFail(model, pid, "process");
          const scope = [pid, ...descendants(model, pid)];
          const found = new Map<string, string[]>();
          for (const l of editorLinks(model).map(linkInfo)) {
            if (l.kind === "requires" && scope.includes(l.owner) && objects(model)[l.target]?.role === "module") {
              found.set(l.target, [...(found.get(l.target) ?? []), l.owner]);
            }
          }
          return { process: pid, scope, modules: [...found].map(([id, by]) => ({ id, label: label(model, id), requiredBy: by })) };
        }
        case "processesOfObject": {
          const oid = need(args, "object", "the object to ask about");
          thingOrFail(model, oid, "object");
          const links = editorLinks(model).map(linkInfo).filter((l) => l.target === oid && processes(model)[l.owner]);
          return { object: oid, links: links.map(({ target: _t, owner, ...rest }) => ({ process: owner, ...rest })) };
        }
        case "exchange": {
          const from = need(args, "from", "the giving module or agent");
          const to = need(args, "to", "the receiving module or agent");
          const d = dsm(model, { agents: true });
          for (const id of [from, to]) {
            if (!d.order.includes(id)) throw new ToolError(`"${id}" is not in the N² matrix: it must be a module or an agent that handles a process. Rows: ${d.order.join(", ")}.`);
          }
          const procs = Object.keys(processes(model));
          const via = (a: string, b: string, obj: string) => procs.flatMap((g) =>
            performers(model, g).includes(a) && givenBy(model, g).includes(obj)
              ? procs.filter((t) => t !== g && performers(model, t).includes(b) && usedBy(model, t).includes(obj)).map((t) => ({ giver: g, taker: t }))
              : []);
          const cell = (a: string, b: string) => (d.cells[a]?.[b] ?? []).map((o) => ({ id: o, label: label(model, o), via: via(a, b, o) }));
          return {
            from, to,
            objects: cell(from, to),
            reverse: cell(to, from),
            cycle: d.cycles.some((c) => c.includes(from) && c.includes(to)),
          };
        }
        case "storyLanes":
          return storyLanes(model, need(args, "story", "the story id"));
        default:
          throw new ToolError(`Unknown question "${String(args.question)}".`);
      }
    },
  }
];
