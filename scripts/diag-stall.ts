/**
 * 用法：npx vite-node scripts/diag-stall.ts [每种人数的局数] [回合上限] [passive]
 * 排查长局 / 僵持：统计各人数的回合数分布；超过上限的局打印存活者状态。
 * 加 passive 时 0 号位是「不出牌的玩家」（出牌阶段直接结束，能不响应就不响应）。
 */
import { BasicAI, ELIMINATION_TUNING } from '../src/ai/basic';
import { generalDef } from '../src/data/generals';
import { Game } from '../src/engine/game';
import type { Controller, GameView, Request, Response } from '../src/engine/types';

Object.assign(ELIMINATION_TUNING, JSON.parse(process.env.ELIM ?? '{}'));
const N = Number(process.argv[2] ?? 300);
const MAX = Number(process.argv[3] ?? 300);
const PASSIVE = process.argv.includes('passive');
const VERBOSE = Number(process.env.VERBOSE ?? 3);

class Passive implements Controller {
  private ai = new BasicAI();
  async decide<R extends Request>(view: GameView, req: R): Promise<Response<R>> {
    if (req.type === 'play') return { type: 'end' } as Response<R>;
    if (req.type === 'respond') return null as Response<R>;
    return this.ai.decide(view, req);
  }
}

for (const n of [5, 6, 7, 8]) {
  const turns: number[] = [];
  const stuck: string[] = [];
  const stuckShape: Record<string, number> = {};
  const wins: Record<string, number> = {};
  for (let seed = 1; seed <= N; seed++) {
    const controllers: Controller[] = Array.from({ length: n }, (_, i) => (PASSIVE && i === 0 ? new Passive() : new BasicAI()));
    const game = new Game({ controllers, seed, maxTurns: MAX });
    try {
      const w = await game.start();
      wins[w] = (wins[w] ?? 0) + 1;
      turns.push(game.turn);
    } catch (e) {
      if (!String(e).includes('最大回合数')) throw e;
      const alive = game.players.filter((p) => p.alive);
      const shape = alive.map((p) => p.role).sort().join('+');
      stuckShape[shape] = (stuckShape[shape] ?? 0) + 1;
      if (stuck.length < VERBOSE) {
        const dmg = game.log.filter((l) => l.event?.type === 'damage');
        const lastDmg = dmg.at(-1)?.turn ?? 0;
        const deaths = game.log.filter((l) => l.event?.type === 'death').map((l) => l.turn);
        stuck.push(
          [
            `  seed ${seed}：阵亡回合 [${deaths.join(', ')}]，最后一次伤害在第 ${lastDmg} 回合，牌堆 ${game.drawPile.length} / 弃牌 ${game.discardPile.length}`,
            ...alive.map(
              (p) =>
                `    ${p.seat}号 ${p.role} ${generalDef(p.general).name} ${p.hp}/${p.maxHp} 手牌[${p.hand.map((c) => c.key).join(',')}] 装备[${Object.values(p.equips)
                  .filter(Boolean)
                  .map((c) => c!.key)
                  .join(',')}]`,
            ),
            ...(process.env.TAIL ? game.log.slice(-Number(process.env.TAIL)) : []).map((l) => `      ${l.text}`),
          ].join('\n'),
        );
      }
    }
  }
  turns.sort((a, b) => a - b);
  const q = (f: number) => turns[Math.min(turns.length - 1, Math.floor(turns.length * f))];
  const stuckN = N - turns.length;
  console.log(`${n} 人：中位 ${q(0.5)}，90% ${q(0.9)}，99% ${q(0.99)}，最长 ${turns.at(-1)}；超过 ${MAX} 回合 ${stuckN} 局（${((stuckN / N) * 100).toFixed(1)}%）`, JSON.stringify(stuckShape), '胜者', Object.entries(wins).map(([k, v]) => `${k} ${((v / N) * 100).toFixed(1)}%`).join(' '));
  for (const s of stuck) console.log(s);
}
