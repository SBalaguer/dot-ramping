import { DatabaseSync } from "node:sqlite";

import type { Hex } from "viem";

import type { RequestKind } from "./requests";
import type { TopUp } from "./topup";

export interface StoredRequest {
  sequence: number;
  topUpId: Hex;
  kind: RequestKind;
}

/**
 * Top-ups as JSON documents in SQLite; every change is written before the next step runs. Only the worker
 * writes top-ups once they exist: the API leaves operator requests in a queue of their own, so a request
 * never overwrites a step the worker is in the middle of.
 */
export class Store {
  readonly #db: DatabaseSync;

  constructor(path: string) {
    this.#db = new DatabaseSync(path);
    this.#db.exec(
      "CREATE TABLE IF NOT EXISTS topups (id TEXT PRIMARY KEY, state TEXT NOT NULL, created_at INTEGER NOT NULL, doc TEXT NOT NULL)",
    );
    this.#db.exec(
      "CREATE TABLE IF NOT EXISTS requests (sequence INTEGER PRIMARY KEY AUTOINCREMENT, topup_id TEXT NOT NULL, kind TEXT NOT NULL)",
    );
  }

  save(topUp: TopUp): void {
    this.#db
      .prepare(
        "INSERT INTO topups (id, state, created_at, doc) VALUES (?, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET state = excluded.state, doc = excluded.doc",
      )
      .run(topUp.id, topUp.state, topUp.createdAt, JSON.stringify(topUp));
  }

  get(id: Hex): TopUp | undefined {
    const row = this.#db.prepare("SELECT doc FROM topups WHERE id = ?").get(id);
    return row && (JSON.parse(row.doc as string) as TopUp);
  }

  all(): TopUp[] {
    return this.#read("SELECT doc FROM topups ORDER BY created_at DESC");
  }

  /** Top-ups the worker still has to move: not complete, refunded or failed. */
  open(): TopUp[] {
    return this.#read(
      "SELECT doc FROM topups WHERE state NOT IN ('COMPLETED', 'REFUNDED', 'FAILED') ORDER BY created_at",
    );
  }

  request(topUpId: Hex, kind: RequestKind): void {
    this.#db.prepare("INSERT INTO requests (topup_id, kind) VALUES (?, ?)").run(topUpId, kind);
  }

  requests(): StoredRequest[] {
    return this.#db
      .prepare("SELECT sequence, topup_id, kind FROM requests ORDER BY sequence")
      .all()
      .map((row) => ({
        sequence: row.sequence as number,
        topUpId: row.topup_id as Hex,
        kind: row.kind as RequestKind,
      }));
  }

  /** Removes a request once it has been carried out or turned down. */
  settle(sequence: number): void {
    this.#db.prepare("DELETE FROM requests WHERE sequence = ?").run(sequence);
  }

  close(): void {
    this.#db.close();
  }

  #read(query: string): TopUp[] {
    return this.#db
      .prepare(query)
      .all()
      .map((row) => JSON.parse(row.doc as string) as TopUp);
  }
}
