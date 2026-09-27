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

// the preview webview loads Mermaid from the extension, without network access
mkdirSync("media", { recursive: true });
copyFileSync("node_modules/mermaid/dist/mermaid.min.js", "media/mermaid.min.js");
