declare module "node:sqlite" {
  export class DatabaseSync {
    constructor(
      location: string,
      options?: { open?: boolean; readOnly?: boolean },
    );
    close(): void;
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
  }

  export interface StatementSync {
    all(...params: unknown[]): unknown[];
    get(...params: unknown[]): unknown;
    run(...params: unknown[]): {
      changes: number;
      lastInsertRowid: number | bigint;
    };
  }
}
