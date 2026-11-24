import { hydration as hydrationDescriptors } from "@galacticcouncil/descriptors";
import { blake2b256 } from "@polkadot-labs/hdkd-helpers";
import type { Network } from "@whm/chopsticks";
import { toHex, type Hex } from "viem";

interface EncodableCall {
  getEncodedData: () => Promise<Uint8Array>;
}

/** SCALE compact length prefix, as a stored `BoundedVec<u8>` carries it. */
function compactLength(length: number): Hex {
  if (length < 1 << 6) return toHex(length << 2, { size: 1 });
  if (length < 1 << 14) {
    const value = (length << 2) | 0b01;
    return toHex(new Uint8Array([value & 0xff, value >> 8]));
  }
  throw new Error(`a ${length}-byte call needs the four-byte compact mode`);
}

/**
 * Enacts `call` as Hydration's EconomicParameters governance track would: the preimage and a scheduler entry
 * for the next block are written into storage, and the runtime dispatches the call itself. This stands in for
 * a referendum passing; nothing about the call's own execution is simulated.
 */
export async function enactAsEconomicParameters(hydration: Network, call: EncodableCall): Promise<void> {
  const api = hydration.client.getTypedApi(hydrationDescriptors);
  const encoded = await call.getEncodedData();
  const hash = toHex(blake2b256(encoded));
  const next = (await api.query.System.Number.getValue({ at: "best" })) + 1;

  await hydration.setStorage({
    Preimage: {
      PreimageFor: [[[[hash, encoded.length]], `${compactLength(encoded.length)}${toHex(encoded).slice(2)}`]],
    },
    Scheduler: {
      Agenda: [
        [
          [next],
          [
            {
              call: { Lookup: { hash, len: encoded.length } },
              origin: { Origins: "EconomicParameters" },
              maybeId: null,
              priority: 0,
              maybePeriodic: null,
            },
          ],
        ],
      ],
    },
  });
  const block = await hydration.newBlock();
  const events = await api.query.System.Events.getValue({ at: block });
  const dispatched = events.some(({ event }) => event.type === "Scheduler" && event.value.type === "Dispatched");
  if (!dispatched) throw new Error(`the scheduler did not dispatch the governance call in block ${block}`);
}
