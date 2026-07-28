// Renderer-side data access. In Electron, SQL runs in the main process over
// the preload bridge (window.scaleBridge) — the renderer never touches Node.
// In a plain browser (ng serve / legacy web use) there is no local store and
// callers must branch on hasLocalStore() before reaching for one.

export interface SqlOp {
  sql: string;
  params?: unknown[];
}

export interface DataStore {
  query<T>(sql: string, params?: unknown[]): Promise<T[]>;
  get<T>(sql: string, params?: unknown[]): Promise<T | null>;
  run(sql: string, params?: unknown[]): Promise<{ changes: number }>;
  transaction(ops: SqlOp[]): Promise<void>;
}

interface ScaleBridge {
  db: {
    query(sql: string, params?: unknown[]): Promise<unknown[]>;
    get(sql: string, params?: unknown[]): Promise<unknown>;
    run(sql: string, params?: unknown[]): Promise<{ changes: number }>;
    transaction(ops: SqlOp[]): Promise<unknown>;
  };
  platform: string;
  versions: Record<string, string>;
}

declare global {
  interface Window {
    scaleBridge?: ScaleBridge;
  }
}

export function hasLocalStore(): boolean {
  return typeof window !== 'undefined' && window.scaleBridge !== undefined;
}

export class IpcDataStore implements DataStore {
  private get bridge(): ScaleBridge {
    const bridge = window.scaleBridge;
    if (!bridge) {
      throw new Error('IpcDataStore used outside Electron — guard with hasLocalStore().');
    }
    return bridge;
  }

  async query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    return (await this.bridge.db.query(sql, params)) as T[];
  }

  async get<T>(sql: string, params: unknown[] = []): Promise<T | null> {
    return ((await this.bridge.db.get(sql, params)) as T) ?? null;
  }

  async run(sql: string, params: unknown[] = []): Promise<{ changes: number }> {
    return this.bridge.db.run(sql, params);
  }

  async transaction(ops: SqlOp[]): Promise<void> {
    await this.bridge.db.transaction(ops);
  }
}
