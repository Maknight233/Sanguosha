/**
 * 用法：npx vite-node scripts/diag-suspicion.ts [局数]
 * 统计 AI 决策时对「身份未知的其他存活角色」的内奸嫌疑判断：真内奸被认出的比例、非内奸被误判的比例。
 * 只统计主公、忠臣、反贼的视角（内奸自己不需要找内奸）。
 */
import { SUSPICION_TUNING, BasicAI, inferOf, LEAN_THRESHOLD } from '../src/ai/basic';
import { Game } from '../src/engine/game';
import type { Controller, GameView, Request, Response } from '../src/engine/types';

Object.assign(SUSPICION_TUNING, JSON.parse(process.env.SUSPICION ?? '{}'));
const N = Number(process.argv[2] ?? 2000);
type Row = { seen: number; suspected: number; looksLoyal: number; looksRebel: number; suspectedWhenLoyal: number; suspectedWhenRebel: number };
const row = (): Row => ({ seen: 0, suspected: 0, looksLoyal: 0, looksRebel: 0, suspectedWhenLoyal: 0, suspectedWhenRebel: 0 });
const stats: Record<string, Row> = { renegade: row(), loyalist: row(), rebel: row() };
let game: Game;

class Probe implements Controller {
  private ai = new BasicAI();
  decide<R extends Request>(view: GameView, req: R): Promise<Response<R>> {
    const myRole = view.players[view.me].role;
    if (myRole !== 'renegade' && req.type === 'play') {
      for (const p of view.players) {
        if (!p.alive || p.role !== null || p.seat === view.me) continue;
        const r = stats[game.players[p.seat].role];
        const inf = inferOf(view, p.seat);
        r.seen++;
        if (inf.suspected) r.suspected++;
        if (inf.lean > LEAN_THRESHOLD) {
          r.looksLoyal++;
          if (inf.suspected) r.suspectedWhenLoyal++;
        }
        if (inf.lean < -LEAN_THRESHOLD) {
          r.looksRebel++;
          if (inf.suspected) r.suspectedWhenRebel++;
        }
      }
    }
    return this.ai.decide(view, req);
  }
}

for (let seed = 1; seed <= N; seed++) {
  game = new Game({ controllers: [0, 1, 2, 3, 4].map(() => new Probe()), seed, maxTurns: 500 });
  try {
    await game.start();
  } catch {
    /* 超时局忽略 */
  }
}
const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(1)}%` : '-');
console.log('真实身份  观察次数  被疑内奸  偏忠中被疑  偏反中被疑  偏忠占比  偏反占比');
for (const [k, r] of Object.entries(stats))
  console.log(
    k.padEnd(9),
    String(r.seen).padStart(8),
    pct(r.suspected, r.seen).padStart(9),
    pct(r.suspectedWhenLoyal, r.looksLoyal).padStart(10),
    pct(r.suspectedWhenRebel, r.looksRebel).padStart(10),
    pct(r.looksLoyal, r.seen).padStart(9),
    pct(r.looksRebel, r.seen).padStart(9),
  );
