// 项目没装 @types/node；这里只声明 tools/voice 用到的那几个 Node API，供类型检查用。

declare module 'node:child_process' {
  interface SpawnSyncResult {
    status: number | null;
    error?: Error;
    stdout: string | Uint8Array;
    stderr: string | Uint8Array;
  }
  export function spawnSync(
    cmd: string,
    args: string[],
    opts?: { env?: Record<string, string | undefined>; encoding?: 'utf8'; timeout?: number; maxBuffer?: number; input?: Uint8Array },
  ): SpawnSyncResult;
}

declare module 'node:crypto' {
  interface Hash {
    update(data: string): Hash;
    digest(encoding: 'hex'): string;
  }
  export function createHash(algorithm: string): Hash;
}

declare module 'node:fs' {
  export function readFileSync(path: string, encoding: 'utf8'): string;
  export function writeFileSync(path: string, data: Uint8Array | string): void;
  export function existsSync(path: string): boolean;
  export function mkdirSync(path: string, opts?: { recursive?: boolean }): void;
  export function renameSync(from: string, to: string): void;
  export function rmSync(path: string, opts?: { force?: boolean; recursive?: boolean }): void;
}

declare module 'node:os' {
  export function homedir(): string;
}

declare module 'node:path' {
  export function join(...parts: string[]): string;
  export function dirname(p: string): string;
  export function relative(from: string, to: string): string;
}

declare module 'node:url' {
  export function fileURLToPath(url: string | URL): string;
}

declare const process: {
  argv: string[];
  env: Record<string, string | undefined>;
  pid: number;
  exit(code?: number): never;
};

interface ImportMeta {
  url: string;
}
