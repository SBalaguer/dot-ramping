import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { Address } from "viem";

/** Addresses of what we deployed, one JSON file per chain under `deployments/`. */
export interface Deployments {
  sepolia: {
    nttManager: Address;
    nttTransceiver: Address;
    basejumpEmitter: Address;
    factory: Address;
  };
  "hydration-fork": {
    wormholeCore: Address;
    basejumpLanding: Address;
    basejumpReceiver: Address;
  };
}

export type DeploymentName = keyof Deployments;

const REQUIRED: { [K in DeploymentName]: (keyof Deployments[K])[] } = {
  sepolia: ["nttManager", "nttTransceiver", "basejumpEmitter", "factory"],
  "hydration-fork": ["wormholeCore", "basejumpLanding", "basejumpReceiver"],
};

const fileOf = (name: DeploymentName): string =>
  fileURLToPath(new URL(`../../../deployments/${name}.json`, import.meta.url));

/** What has been recorded so far; a deployment script resumes from this. */
export function readPartialDeployment<K extends DeploymentName>(name: K): Partial<Deployments[K]> {
  const file = fileOf(name);
  return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as Partial<Deployments[K]>) : {};
}

export function readDeployment<K extends DeploymentName>(name: K): Deployments[K] {
  const deployment = readPartialDeployment(name);
  const missing = REQUIRED[name].filter((key) => !deployment[key]);
  if (missing.length > 0) {
    throw new Error(`deployments/${name}.json lacks ${missing.join(", ")}; deploy that chain first`);
  }
  return deployment as Deployments[K];
}

export function writeDeployment<K extends DeploymentName>(name: K, deployment: Partial<Deployments[K]>): void {
  writeFileSync(fileOf(name), `${JSON.stringify(deployment, null, 2)}\n`);
}
