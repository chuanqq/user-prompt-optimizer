import esbuild from "esbuild";
import process from "process";
// Node's built-in module list, used to mark them as external (don't bundle).
// Replaces the deprecated `builtin-modules` package.
import { builtinModules } from "module";

const prod = process.argv[2] === "production";

const ctx = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: ["obsidian", "electron", "@codemirror/state", "@codemirror/view", ...builtinModules],
  format: "cjs",
  target: "es2022",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  outfile: "main.js",
  minify: prod,
  loader: { ".md": "text" },
});

if (prod) {
  await ctx.rebuild();
  await ctx.dispose();
  process.exit(0);
} else {
  await ctx.watch();
}
