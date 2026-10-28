import { writeFile } from "node:fs/promises";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { URL } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const [flag, value, ...rest] = process.argv.slice(2);
if (flag !== "--api-url" || !value || rest.length > 0) {
  throw new Error(
    "Usage: node scripts/prepare-vercel-preview.mjs --api-url https://<exact-api-deployment>.vercel.app",
  );
}

const apiUrl = new URL(value);
if (
  apiUrl.protocol !== "https:" ||
  apiUrl.username ||
  apiUrl.password ||
  apiUrl.pathname !== "/" ||
  apiUrl.search ||
  apiUrl.hash
) {
  throw new Error(
    "API deployment URL must be an HTTPS origin with no credentials, path, query, or fragment",
  );
}
if (!apiUrl.hostname.endsWith(".vercel.app")) {
  throw new Error("Use the exact deployment URL shown by Vercel, not a local URL or custom alias");
}

const config = {
  version: 2,
  installCommand: "cd ../.. && pnpm install --frozen-lockfile",
  buildCommand:
    "cd ../.. && pnpm --filter @sazeh/contracts build && pnpm --filter @sazeh/web build",
  rewrites: [{ source: "/api/:path*", destination: `${apiUrl.origin}/api/:path*` }],
};
const output = resolve(here, "../apps/web/vercel.json");
await writeFile(output, `${JSON.stringify(config, null, 2)}\n`, { flag: "w" });
process.stdout.write(`Paired frontend rewrite written to ${output}\n`);
