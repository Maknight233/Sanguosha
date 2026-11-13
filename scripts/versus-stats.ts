/**
 * 用法：PLAYERS=2|4 npx vite-node scripts/versus-stats.ts [局数，默认 10000] [分片号] [分片数]
 * 对战模式（1v1 / 2v2）：普通 AI 对战，武将从可选池中随机分配（不经过 AI 选将偏好），
 * 统计先手方 / 后手方胜率、平局率、回合数（2v2 另统计第一人阵亡后残局的回合数与落单方翻盘率），以及每名武将的胜率（50% 为平衡）。
 * 分片时输出 JSON 行，便于并行后合并；不分片时直接打印汇总。
 */
import { BasicAI } from '../src/ai/basic';
import { GENERAL_KEYS } from '../src/data/generals';
import { DUEL_BANNED, Game, isDuel, TEAM_BANNED } from '../src/engine/game';
import { Rng } from '../src/engine/rng';

const N = Number(process.argv[2] ?? 10000);
const shard = Number(process.argv[3] ?? 0);
const shards = Number(process.argv[4] ?? 1);
const players = Number(process.env.PLAYERS ?? 2);
const banned = isDuel(players) ? DUEL_BANNED : TEAM_BANNED;
const POOL = GENERAL_KEYS.filter((g) => !banned.has(g));
const wins = { lord: 0, rebel: 0, draw: 0 };
const turns: number[] = [];
const tails: number[] = [];
let comebacks = 0;
const gen: Record<string, [number, number]> = {};
for (let seed = 1 + shard; seed <= N; seed += shards) {
  const picks = new Rng(seed * 7919).shuffle([...POOL]).slice(0, players);
  const game = new Game({ controllers: picks.map(() => new BasicAI()), seed, generals: picks, maxTurns: 1000 });
  const w = await game.start();
  if (w === 'lord' || w === 'rebel' || w === 'draw') wins[w]++;
  turns.push(game.turn);
  const firstDeath = game.log.find((e) => e.event?.type === 'death');
  if (firstDeath && players > 2) {
    tails.push(game.turn - firstDeath.turn);
    // 翻盘：先阵亡一人的一方最终获胜
    const seat = firstDeath.event!.type === 'death' ? firstDeath.event!.seat : -1;
    if (w !== 'draw' && (w === 'rebel') === (game.players[seat].role === 'rebel')) comebacks++;
  }
  for (const p of game.players) {
    gen[p.general] ??= [0, 0];
    gen[p.general][1]++;
    if (w !== 'draw' && (w === 'rebel') === (p.role === 'rebel')) gen[p.general][0]++;
  }
}
if (shards > 1) {
  console.log(JSON.stringify({ wins, turns, tails, comebacks, gen }));
} else {
  const n = turns.length;
  const med = (a: number[]) => [...a].sort((x, y) => x - y)[a.length >> 1];
  const pct = (x: number, d: number) => `${((x / d) * 100).toFixed(1)}%`;
  console.log(`${players} 人 ${n} 局：先手方 ${pct(wins.lord, n)}，后手方 ${pct(wins.rebel, n)}，平局 ${pct(wins.draw, n)}；回合数中位数 ${med(turns)}${tails.length ? `，第一人阵亡后残局中位数 ${med(tails)} 回合，落单方翻盘 ${pct(comebacks, tails.length)}` : ''}`);
  for (const [g, [w, c]] of Object.entries(gen).sort((a, b) => b[1][0] / b[1][1] - a[1][0] / a[1][1])) console.log(`${g}\t${c} 局\t${pct(w, c)}`);
}
