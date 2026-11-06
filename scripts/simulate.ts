/** 用法：npx vite-node scripts/simulate.ts [局数]  —— 统计 5 个基础 AI 对战的胜率与回合数 */
import { SUSPICION_TUNING, BasicAI } from '../src/ai/basic';
import { Game, WINNER_NAME } from '../src/engine/game';
import type { Winner } from '../src/engine/types';

Object.assign(SUSPICION_TUNING, JSON.parse(process.env.SUSPICION ?? '{}'));
const N = Number(process.argv[2] ?? 500);
const wins: Record<Winner, number> = { lord: 0, rebel: 0, renegade: 0 };
const turns: number[] = [];
let stuck = 0;
for (let seed = 1; seed <= N; seed++) {
  const game = new Game({ controllers: [0, 1, 2, 3, 4].map(() => new BasicAI()), seed, maxTurns: Number(process.argv[3] ?? 500) });
  try {
    wins[await game.start()]++;
    turns.push(game.turn);
  } catch {
    stuck++;
  }
}
turns.sort((a, b) => a - b);
const pct = (n: number) => `${((n / N) * 100).toFixed(1)}%`;
for (const w of Object.keys(wins) as Winner[]) console.log(`${WINNER_NAME[w]}：${wins[w]} 局（${pct(wins[w])}）`);
console.log(`超过回合上限未结束：${stuck} 局`);
console.log(`回合数 中位数 ${turns[Math.floor(turns.length / 2)]}，90% 分位 ${turns[Math.floor(turns.length * 0.9)]}，最长 ${turns.at(-1)}`);
