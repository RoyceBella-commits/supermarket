import './ui/ui.css';
import { Game } from './app/Game.ts';

const container = document.getElementById('app')!;
const game = new Game(container);
game.init().catch((err) => {
  console.error(err);
  const pre = document.createElement('pre');
  pre.style.cssText = 'position:fixed;inset:16px;z-index:99;background:#300;color:#fdd;padding:16px;white-space:pre-wrap;overflow:auto';
  pre.textContent = `启动失败 / Failed to start:\n${err instanceof Error ? err.stack ?? err.message : String(err)}`;
  document.body.appendChild(pre);
});
