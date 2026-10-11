// 项目没装 @types/node；这里只声明 tools/vrm 用到的那几个 Node API，供类型检查用。

declare module 'node:fs' {
  export function readFileSync(path: string): Uint8Array;
  export function writeFileSync(path: string, data: Uint8Array | string): void;
  export function existsSync(path: string): boolean;
  export function mkdirSync(path: string, opts?: { recursive?: boolean }): void;
}

declare module 'node:path' {
  export function join(...parts: string[]): string;
  export function dirname(p: string): string;
  export function basename(p: string): string;
  export function relative(from: string, to: string): string;
}

declare module 'node:url' {
  export function fileURLToPath(url: string | URL): string;
}

declare module 'gltf-validator' {
  interface Message {
    code: string;
    message: string;
    severity: number;
    pointer?: string;
  }
  interface Report {
    issues: { numErrors: number; numWarnings: number; numInfos: number; numHints: number; messages: Message[] };
  }
  const validator: {
    validateBytes(data: Uint8Array, options?: { maxIssues?: number; ignoredIssues?: string[]; uri?: string }): Promise<Report>;
    version(): string;
  };
  export default validator;
}

declare const process: {
  argv: string[];
  exit(code?: number): never;
};

interface ImportMeta {
  url: string;
}
