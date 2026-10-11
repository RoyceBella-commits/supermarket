import { defineConfig, type Plugin } from 'vite';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// 项目位于 exFAT 移动硬盘。如果改了文件页面没有热更新，用 `VITE_POLL=1 npm run dev` 改成轮询监听。
const poll = process.env.VITE_POLL === '1';
const base = process.env.VITE_BASE_PATH ?? '/';

/**
 * 仅开发服务器：POST /__shot?name=xxx 把页面自己渲染的截图（JPEG data URL）存到 tools/.shots/xxx.jpg。
 * 浏览器面板隐藏时页面不出画面，自动化测试用它来看渲染结果。只接受本机请求。
 */
function devShots(): Plugin {
  return {
    name: 'dev-shots',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__shot', (req, res) => {
        const remote = req.socket.remoteAddress ?? '';
        const url = new URL(req.url ?? '', 'http://localhost');
        const name = url.searchParams.get('name') ?? 'shot';
        if (req.method !== 'POST' || !/^[a-z0-9-]{1,40}$/.test(name) || !/^(::1|127\.0\.0\.1|::ffff:127\.0\.0\.1)$/.test(remote)) {
          res.statusCode = 400;
          res.end('bad request');
          return;
        }
        const chunks: Buffer[] = [];
        req.on('data', (c: Buffer) => chunks.push(c));
        req.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          const m = /^data:image\/jpeg;base64,(.+)$/.exec(body);
          if (!m) {
            res.statusCode = 400;
            res.end('expected jpeg data url');
            return;
          }
          const dir = resolve(server.config.root, 'tools/.shots');
          mkdirSync(dir, { recursive: true });
          const file = resolve(dir, `${name}.jpg`);
          writeFileSync(file, Buffer.from(m[1], 'base64'));
          res.end(file);
        });
      });
    },
  };
}

export default defineConfig({
  base,
  plugins: [devShots()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    watch: poll ? { usePolling: true, interval: 300 } : undefined,
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 4096,
  },
});
