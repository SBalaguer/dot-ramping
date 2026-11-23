import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";

export interface AnvilOptions {
  /** Defaults to a free port chosen by the OS. */
  port?: number;
  /** Fork this RPC's chain instead of starting from an empty one. */
  fork?: { url: string; block: number };
}

export interface Anvil {
  url: string;
  stop: () => Promise<void>;
}

const READY_TIMEOUT_MS = 60_000;

async function freePort(): Promise<number> {
  const server = createServer().listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  server.close();
  await once(server, "close");
  if (address === null || typeof address === "string") throw new Error("could not reserve a port");
  return address.port;
}

async function isServing(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function waitUntilServing(url: string, anvil: ChildProcess): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (anvil.exitCode !== null) throw new Error(`anvil exited with code ${anvil.exitCode}`);
    if (await isServing(url)) return;
    await new Promise((retry) => setTimeout(retry, 100));
  }
  throw new Error(`anvil did not serve ${url} within ${READY_TIMEOUT_MS / 1000}s`);
}

/** Starts a local anvil node and resolves once its RPC answers. */
export async function startAnvil({ port, fork }: AnvilOptions = {}): Promise<Anvil> {
  const url = `http://127.0.0.1:${port ?? (await freePort())}`;
  if (await isServing(url)) throw new Error(`${url} is already in use`);

  const forkArgs = fork ? ["--fork-url", fork.url, "--fork-block-number", String(fork.block)] : [];
  const anvil = spawn("anvil", ["--port", new URL(url).port, ...forkArgs], {
    stdio: ["ignore", "ignore", "inherit"],
  });
  const stop = async (): Promise<void> => {
    if (anvil.exitCode !== null) return;
    anvil.kill("SIGTERM");
    await once(anvil, "exit");
  };

  try {
    await waitUntilServing(url, anvil);
  } catch (err) {
    await stop();
    throw err;
  }
  return { url, stop };
}
