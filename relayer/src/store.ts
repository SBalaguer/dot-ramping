import { DatabaseSync } from "node:sqlite";

import type { Hex } from "viem";

import type { TopUp } from "./topup";

/** Top-ups as JSON documents in SQLite; every change is written before the next step runs. */
export class Store {
  readonly #db: DatabaseSync;

  constructor(path: string) {
    this.#db = new DatabaseSync(path);
    this.#db.exec(
      "CREATE TABLE IF NOT EXISTS topups (id TEXT PRIMARY KEY, state TEXT NOT NULL, created_at INTEGER NOT NULL, doc TEXT NOT NULL)",
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

  open(): TopUp[] {
    return this.#read("SELECT doc FROM topups WHERE state != 'COMPLETED' ORDER BY created_at");
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
