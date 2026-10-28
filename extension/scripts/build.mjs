import esbuild from "esbuild";
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = resolve(root, "dist");
const watch = process.argv.includes("--watch");
const env = (k, d = "") => process.env[k] ?? d;

const BACKEND_URL = env("BACKEND_URL", "http://localhost:8000");
const define = {
  __BACKEND_URL__: JSON.stringify(BACKEND_URL),
  __CLIENT_TOKEN__: JSON.stringify(env("CLIENT_TOKEN")),
  __WEB_CLIENT_ID__: JSON.stringify(env("OAUTH_WEB_CLIENT_ID")),
  "process.env.NODE_ENV": JSON.stringify(watch ? "development" : "production"),
};
const alias = { "@mailtrace/core": resolve(root, "../packages/core/src/index.ts") };
const common = { bundle: true, define, alias, target: "chrome120", sourcemap: watch ? "inline" : false, minify: !watch, logLevel: "info", jsx: "automatic", legalComments: "none" };

mkdirSync(dist, { recursive: true });
for (const f of readdirSync(dist)) rmSync(resolve(dist, f), { recursive: true, force: true }); // keep the folder itself so dev servers survive rebuilds

// static files
cpSync(resolve(root, "public"), dist, { recursive: true });
cpSync(resolve(root, "../assets/icons"), resolve(dist, "assets/icons"), { recursive: true });
cpSync(resolve(root, "../assets/logo-full.png"), resolve(dist, "assets/logo-full.png"));
cpSync(resolve(root, "../assets/logo-icon.png"), resolve(dist, "assets/logo-icon.png"));

// manifest (client id + backend origin injected)
const origin = new URL(BACKEND_URL).origin;
const manifest = readFileSync(resolve(root, "manifest.template.json"), "utf8")
  .replace("__BACKEND_ORIGIN__", origin)
  .replace("__OAUTH_CLIENT_ID__", env("OAUTH_CLIENT_ID", "YOUR_CHROME_EXTENSION_OAUTH_CLIENT_ID.apps.googleusercontent.com"));
const m = JSON.parse(manifest);
if (env("EXTENSION_KEY")) m.key = env("EXTENSION_KEY"); // pins the extension ID so the OAuth client keeps working
writeFileSync(resolve(dist, "manifest.json"), JSON.stringify(m, null, 2));

const builds = [
  { ...common, entryPoints: { background: resolve(root, "src/background/index.ts") }, outdir: dist, format: "esm" },
  { ...common, entryPoints: { content: resolve(root, "src/content/index.ts") }, outdir: dist, format: "iife" },
  { ...common, entryPoints: { ui: resolve(root, "src/ui/main.tsx") }, outdir: dist, format: "iife", loader: { ".css": "css" } },
];
if (watch) { for (const b of builds) await (await esbuild.context(b)).watch(); console.log("watching…"); }
else { for (const b of builds) await esbuild.build(b); console.log("✔ built →", dist); }
