/**
 * 用法：npx vite-node scripts/difficulty.ts [局数] [甲难度] [乙难度]
 * 混合对局：每局每个座位随机分配甲 / 乙难度，比较同一身份下两种难度的胜率（按身份校正后的差值）。
 */
import { BasicAI, type AiLevel } from '../src/ai/basic';
import { Game } from '../src/engine/game';
import type { Role, Winner } from '../src/engine/types';

const N = Number(process.argv[2] ?? 2000);
const A = (process.argv[3] ?? 'easy') as AiLevel;
const B = (process.argv[4] ?? 'normal') as AiLevel;
const team = (r: Role): Winner => (r === 'loyalist' ? 'lord' : r);
type T = { games: number; wins: number };
const stat: Record<string, T> = {};
const add = (k: string, won: boolean) => {
  stat[k] ??= { games: 0, wins: 0 };
  stat[k].games++;
  if (won) stat[k].wins++;
};

for (let seed = 1; seed <= N; seed++) {
  // 确定性地为每个座位分配难度
  const levels = [0, 1, 2, 3, 4].map((s) => (((seed * 2654435761 + s * 40503) >>> 7) & 1 ? A : B));
  const game = new Game({ controllers: levels.map((l) => new BasicAI(l)), seed, maxTurns: 600 });
  let winner: Winner;
  try {
    winner = await game.start();
  } catch {
    continue;
  }
  game.players.forEach((p, i) => add(`${p.role}|${levels[i]}`, team(p.role) === winner));
}

const rate = (t?: T) => (t && t.games ? t.wins / t.games : NaN);
let diffSum = 0;
let weight = 0;
console.log(`身份      ${A.padEnd(8)}${B.padEnd(8)}差值`);
for (const r of ['lord', 'loyalist', 'rebel', 'renegade'] as Role[]) {
  const a = stat[`${r}|${A}`];
  const b = stat[`${r}|${B}`];
  const d = rate(a) - rate(b);
  diffSum += d * ((a?.games ?? 0) + (b?.games ?? 0));
  weight += (a?.games ?? 0) + (b?.games ?? 0);
  console.log(r.padEnd(10), `${(rate(a) * 100).toFixed(1)}%`.padEnd(8), `${(rate(b) * 100).toFixed(1)}%`.padEnd(8), `${(d * 100).toFixed(1)}%`, `(${a?.games}/${b?.games})`);
}
console.log(`加权平均差值：${((diffSum / weight) * 100).toFixed(1)}%`);
