const POLL_MS = 1_000;

/** Polls `probe` until it yields a value; forks build a cold first block in over a minute. */
export async function waitFor<T>(what: string, probe: () => Promise<T | undefined>, timeoutMs = 240_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await probe();
    if (value !== undefined) return value;
    await new Promise((retry) => setTimeout(retry, POLL_MS));
  }
  throw new Error(`timed out waiting for ${what}`);
}
