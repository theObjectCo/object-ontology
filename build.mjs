import { build } from "esbuild";
import { copyFileSync, mkdirSync, readdirSync } from "fs";

// jsonc-parser: the ESM build bundles cleanly, its UMD build uses dynamic requires
const common = { bundle: true, platform: "node", target: "node20", format: "cjs", sourcemap: true, logLevel: "warning", mainFields: ["module", "main"] };

await build({ ...common, entryPoints: ["src/extension.ts"], outfile: "dist/extension.js", external: ["vscode"] });
await build({ ...common, entryPoints: ["src/cli.ts"], outfile: "dist/cli.js", banner: { js: "#!/usr/bin/env node" } });
await build({
  ...common,
  entryPoints: readdirSync("test").filter((f) => f.endsWith(".test.ts")).map((f) => `test/${f}`),
  outdir: "dist/test",
});

// the diagram editor: React, React Flow and the styles, as webview.js and webview.css
await build({
  entryPoints: ["src/webview/main.tsx"],
  outfile: "dist/webview.js",
  bundle: true,
  platform: "browser",
  format: "iife",
  target: "es2022",
  jsx: "automatic",
  minify: true,
  sourcemap: true,
  logLevel: "warning",
  mainFields: ["browser", "module", "main"],
  define: { "process.env.NODE_ENV": '"production"' },
});

// ELK runs in a web worker that the webview starts from this file
mkdirSync("media", { recursive: true });
copyFileSync("node_modules/elkjs/lib/elk-worker.min.js", "media/elk-worker.min.js");

// the browser harness for the diagram editor (test/harness), only when asked for
if (process.argv.includes("--harness")) {
  await build({
    entryPoints: ["test/harness/mock.ts"],
    outfile: "dist/harness/mock.js",
    bundle: true,
    platform: "browser",
    format: "iife",
    target: "es2022",
    logLevel: "warning",
    mainFields: ["browser", "module", "main"],
  });
}
