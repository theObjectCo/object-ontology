import * as fs from "fs";
import * as path from "path";
import { check, lineColumn, locate } from "./core/load";
import { markdown, opl } from "./core/render";

const USAGE = `Usage:
  opm validate <model.opm.json>...     report structural and OPM errors; exit code 1 on errors
  opm render <model.opm.json> [-o file.md]
                                       write a markdown document with Mermaid diagrams and OPL
  opm opl <model.opm.json>             print the OPL sentences`;

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

function main(argv: string[]): number {
  const [command, ...rest] = argv;
  if (command === "validate" && rest.length) return validateCommand(rest);
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
    fs.writeFileSync(out, markdown(model), "utf-8");
    console.log(`written ${path.relative(process.cwd(), out)}`);
    return 0;
  }
  console.log(USAGE);
  return command === "help" || command === "--help" ? 0 : 2;
}

process.exit(main(process.argv.slice(2)));
