import { defineConfig } from 'vite';

// 项目位于 exFAT 移动硬盘。如果改了文件页面没有热更新，用 `VITE_POLL=1 npm run dev` 改成轮询监听。
const poll = process.env.VITE_POLL === '1';

export default defineConfig({
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
