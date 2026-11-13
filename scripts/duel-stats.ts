/**
 * 用法：npx vite-node scripts/duel-stats.ts [局数，默认 10000]
 * 1v1 对决：两个普通 AI 对战，武将从 1v1 可选池中随机分配（不经过 AI 选将偏好），
 * 统计先手 / 后手胜率、平局率、回合数，以及每名武将的胜率（1v1 没有身份，直接比胜率，50% 为平衡）。
 */
import { BasicAI } from '../src/ai/basic';
import { GENERAL_KEYS } from '../src/data/generals';
import { DUEL_BANNED, Game } from '../src/engine/game';
import { Rng } from '../src/engine/rng';

const N = Number(process.argv[2] ?? 10000);
const POOL = GENERAL_KEYS.filter((g) => !DUEL_BANNED.has(g));
const wins = { lord: 0, rebel: 0, draw: 0 };
const turns: number[] = [];
const gen: Record<string, [number, number]> = {};
for (let seed = 1; seed <= N; seed++) {
  const pair = new Rng(seed * 7919).shuffle([...POOL]).slice(0, 2);
  const game = new Game({ controllers: [new BasicAI(), new BasicAI()], seed, generals: pair, maxTurns: 400 });
  const w = await game.start();
  if (w === 'lord' || w === 'rebel' || w === 'draw') wins[w]++;
  turns.push(game.turn);
  for (const p of game.players) {
    gen[p.general] ??= [0, 0];
    gen[p.general][1]++;
    if (w !== 'draw' && (w === 'lord') === (p.role === 'lord')) gen[p.general][0]++;
  }
}
turns.sort((a, b) => a - b);
const pct = (n: number, d: number) => `${((n / d) * 100).toFixed(1)}%`;
console.log(`1v1 ${N} 局：先手 ${pct(wins.lord, N)}，后手 ${pct(wins.rebel, N)}，平局 ${pct(wins.draw, N)}；回合数中位数 ${turns[N >> 1]}，90% 分位 ${turns[Math.floor(N * 0.9)]}`);
for (const [g, [w, n]] of Object.entries(gen).sort((a, b) => b[1][0] / b[1][1] - a[1][0] / a[1][1])) console.log(`${g}\t${n} 局\t${pct(w, n)}`);
