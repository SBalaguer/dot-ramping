import { forwarderAddress, newTopUpSecrets, topUpParams } from "@onramp/keys";
import type { Address } from "viem";

import { accountOf } from "./secrets";
import type { SourceChain, TopUp } from "./topup";

export interface TopUpRequest {
  sourceChain: SourceChain;
  factory: Address;
  /** Routes the factory has on the source chain; all of them are bound into the deposit address. */
  routeMask: number;
}

/** A new top-up: fresh secrets, and from them alone its Asset Hub account, refund key and deposit address. */
export function createTopUp({ sourceChain, factory, routeMask }: TopUpRequest, now = Date.now()): TopUp {
  const secrets = newTopUpSecrets();
  const params = topUpParams(secrets, routeMask);
  const draft = { ...secrets, routeMask } as TopUp;
  return {
    ...secrets,
    sourceChain,
    beneficiary: { ss58: accountOf(draft).address, accountId: params.beneficiary },
    forwarder: forwarderAddress(factory, params),
    refund: params.refund,
    routeMask,
    state: "CREATED",
    steps: [],
    createdAt: now,
    updatedAt: now,
  };
}
