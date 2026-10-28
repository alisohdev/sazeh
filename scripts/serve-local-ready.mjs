import { spawn } from "node:child_process";
import { request } from "node:http";
import process from "node:process";
import { setTimeout } from "node:timers/promises";

const apiPort = Number(process.env.API_PORT ?? 3000);
const frontendUrl = "http://127.0.0.1:4173";
const apiReadyUrl = `http://127.0.0.1:${apiPort}/api/health/ready`;
const command = process.platform === "win32" ? (process.env.ComSpec ?? "cmd.exe") : "pnpm";
const args =
  process.platform === "win32" ? ["/d", "/s", "/c", "pnpm serve:local"] : ["serve:local"];
const server = spawn(command, args, {
  stdio: "inherit",
});

let exitCode;
const exited = new Promise((resolve) =>
  server.once("exit", (code) => {
    exitCode = code ?? 1;
    resolve(exitCode);
  }),
);
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => server.kill(signal));
}

const deadline = Date.now() + 60_000;
while (Date.now() < deadline) {
  if (exitCode !== undefined)
    throw new Error(`Local services exited before readiness (${exitCode}).`);
  if ((await isReady(apiReadyUrl)) && (await isReady(frontendUrl))) break;
  await setTimeout(250);
}
if (Date.now() >= deadline)
  throw new Error("Local API and PWA did not become ready in 60 seconds.");

await exited;
process.exitCode = exitCode ?? 1;

async function isReady(url) {
  return new Promise((resolve) => {
    const probe = request(url, { method: "GET", timeout: 1_000 }, (response) => {
      response.resume();
      resolve(response.statusCode === 200);
    });
    probe.on("error", () => resolve(false));
    probe.on("timeout", () => probe.destroy());
    probe.end();
  });
}
