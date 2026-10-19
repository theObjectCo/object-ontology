import * as fs from "fs";
import * as path from "path";
import { check, lineColumn, locate } from "./core/load";
import { opl } from "./core/render";
import { MethodId, documentWithMethods, parseMethods } from "./core/methods/index";
import { dsmMarkdown } from "./core/methods/dsm";
import { flowMarkdown } from "./core/methods/flow";
import { idef0Markdown } from "./core/methods/idef0";
import { sipocMarkdown } from "./core/methods/sipoc";
import { processes } from "./core/model";

const USAGE = `Usage:
  opm validate <model.opm.json>...     report structural and OPM errors; exit code 1 on errors
  opm render <model.opm.json> [-o file.md] [--methods idef0,sipoc,dsm,flow|none]
                                       write a markdown document with Mermaid diagrams and OPL,
                                       then the other views of the model (default: all four)
  opm opl <model.opm.json>             print the OPL sentences
  opm idef0 <model.opm.json> [process] print the IDEF0 boxes of the top-level and zoomed processes
  opm sipoc <model.opm.json> [process] print the SIPOC table of every top-level process
  opm dsm <model.opm.json> [--no-agents]
                                       print the N² matrix of modules and agents
  opm flow <model.opm.json> [process]  print the swimlane flow of every zoomed process`;

function load(file: string) {
  const text = fs.readFileSync(file, "utf-8");
  return { text, ...check(file, text) };
}

function validateCommand(files: string[]): number {
  let errors = 0;
  for (const file of files) {
    const { text, tree, errors: found } = load(file);
    for (const d of found) {
      const { line, column } = lineColumn(text, locate(tree, d.path).offset);
      console.log(`${file}:${line}:${column}: ${d.severity} [${d.code}] ${d.message}`);
      if (d.severity === "error") errors++;
    }
    if (!found.length) console.log(`${file}: OK`);
  }
  return errors ? 1 : 0;
}

/** Prints the markdown section of one method, for the whole model or for one process. */
function methodCommand(command: MethodId, file: string, args: string[]): number {
  const { model, errors } = load(file);
  const fatal = errors.filter((e) => e.severity === "error");
  if (!model || fatal.length) {
    console.error(`${file}: ${fatal.length || 1} error(s); run "opm validate ${file}" for details.`);
    return 1;
  }
  const pid = args.find((a) => !a.startsWith("--"));
  if (pid && !processes(model)[pid]) {
    console.error(`${file}: no process "${pid}".`);
    return 1;
  }
  const ids = pid ? [pid] : undefined;
  const lines = command === "idef0" ? idef0Markdown(model, ids)
    : command === "sipoc" ? sipocMarkdown(model, ids)
    : command === "flow" ? flowMarkdown(model, ids)
    : dsmMarkdown(model, { agents: !args.includes("--no-agents") });
  console.log(lines.join("\n").trimEnd() || `${file}: nothing to show.`);
  return 0;
}

function main(argv: string[]): number {
  const [command, ...rest] = argv;
  if (command === "validate" && rest.length) return validateCommand(rest);
  if ((command === "idef0" || command === "sipoc" || command === "dsm" || command === "flow") && rest.length) {
    return methodCommand(command, rest[0], rest.slice(1));
  }
  if ((command === "render" || command === "opl") && rest.length) {
    const file = rest[0];
    const { model, errors } = load(file);
    const fatal = errors.filter((e) => e.severity === "error");
    if (!model || fatal.length) {
      console.error(`${file}: ${fatal.length || 1} error(s); run "opm validate ${file}" for details.`);
      return 1;
    }
    if (command === "opl") {
      console.log(opl(model).join("\n"));
      return 0;
    }
    const o = rest.indexOf("-o");
    const out = o >= 0 && rest[o + 1] ? rest[o + 1] : file.replace(/\.opm\.json$/, "") + ".md";
    const m = rest.indexOf("--methods");
    let methods: MethodId[];
    try {
      methods = m >= 0 ? parseMethods(rest[m + 1] ?? "") : parseMethods("all");
    } catch (e) {
      console.error(e instanceof Error ? e.message : String(e));
      return 2;
    }
    fs.writeFileSync(out, documentWithMethods(model, methods), "utf-8");
    console.log(`written ${path.relative(process.cwd(), out)}`);
    return 0;
  }
  console.log(USAGE);
  return command === "help" || command === "--help" ? 0 : 2;
}

process.exit(main(process.argv.slice(2)));
