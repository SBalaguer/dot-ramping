import { deriveBeneficiary, topUpParams, type Beneficiary, type ForwarderParams } from "@onramp/keys";

import type { TopUp } from "./topup";

/** The forwarder params are re-derived from the top-up's secrets, never read back from stored addresses. */
export function paramsOf({ id, entropy, routeMask }: TopUp): ForwarderParams {
  return topUpParams({ id, entropy }, routeMask);
}

/** The top-up's own Polkadot account, which signs its Hydration transaction. */
export function accountOf({ id, entropy }: TopUp): Beneficiary {
  return deriveBeneficiary({ id, entropy });
}
