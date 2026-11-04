/**
 * 用法：npx vite-node scripts/general-stats.ts [局数]
 * AI 随机选将，统计每个武将按身份校正后的胜率（该武将胜率 − 同身份平均胜率）。
 */
import { BasicAI } from '../src/ai/basic';
import { Game } from '../src/engine/game';
import type { Controller, GameView, Request, Response, Role, Winner } from '../src/engine/types';
import { GENERALS } from '../src/data/generals';

const N = Number(process.argv[2] ?? 2000);
let rng = 1;
const rand = () => ((rng = (rng * 1103515245 + 12345) % 2147483648) / 2147483648);

class RandomPick implements Controller {
  ai = new BasicAI();
  async decide<R extends Request>(view: GameView, req: R): Promise<Response<R>> {
    if (req.type === 'chooseGeneral') return req.options[Math.floor(rand() * req.options.length)] as Response<R>;
    return this.ai.decide(view, req);
  }
}

const won = (role: Role, w: Winner) => (w === 'lord' ? role === 'lord' || role === 'loyalist' : w === role);
const roleStat: Record<string, [number, number]> = {};
const genStat: Record<string, { n: number; diff: number; byRole: Record<string, number> }> = {};
const records: [string, Role, boolean][] = [];
for (let seed = 1; seed <= N; seed++) {
  rng = seed * 7919;
  const game = new Game({ controllers: [0, 1, 2, 3, 4].map(() => new RandomPick()), seed, maxTurns: 500 });
  let w: Winner;
  try { w = await game.start(); } catch { continue; }
  for (const p of game.players) {
    const ok = won(p.role, w);
    (roleStat[p.role] ??= [0, 0])[0] += ok ? 1 : 0;
    roleStat[p.role][1]++;
    records.push([p.general!, p.role, ok]);
  }
}
const avg = (r: string) => roleStat[r][0] / roleStat[r][1];
for (const [g, r, ok] of records) {
  const s = (genStat[g] ??= { n: 0, diff: 0, byRole: {} });
  s.n++;
  s.diff += (ok ? 1 : 0) - avg(r);
  s.byRole[r] = (s.byRole[r] ?? 0) + 1;
}
const name = (k: string) => GENERALS[k]?.name ?? k;
console.log('各身份平均胜率', Object.fromEntries(Object.keys(roleStat).map((r) => [r, (avg(r) * 100).toFixed(1) + '%'])));
for (const [g, s] of Object.entries(genStat).sort((a, b) => b[1].diff / b[1].n - a[1].diff / a[1].n))
  console.log(`${name(g)}\t${s.n} 次\t${((s.diff / s.n) * 100).toFixed(1)}%`);
