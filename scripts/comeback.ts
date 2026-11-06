/**
 * 新卡牌（天雷等）的影响：对比「原牌堆」与「当前牌堆」的胜率、翻盘率与天雷数据。
 * 用法：npx vite-node scripts/comeback.ts [局数] [快照回合]
 *
 * 翻盘率：到快照回合时，主公方（主公 + 忠臣）与反贼方的总体力不同，体力落后的一方最终获胜的比例。
 */
import { BasicAI } from '../src/ai/basic';
import { DECK_SPEC, TIANLEI_TUNING } from '../src/data/cards';
import { Game } from '../src/engine/game';

const N = Number(process.argv[2] ?? 5000);
const SNAP_TURN = Number(process.argv[3] ?? 10);
const NEW_KEYS = ['tianlei', 'suozijia', 'shoumiandun', 'liuxingchui'];
Object.assign(TIANLEI_TUNING, JSON.parse(process.env.TIANLEI ?? '{}'));
const COPIES = process.env.COPIES ? Number(process.env.COPIES) : undefined;
const FULL = DECK_SPEC.map((d) => (d.key === 'tianlei' && COPIES !== undefined ? { ...d, count: COPIES } : d));

interface Result {
  wins: Record<string, number>;
  behind: number;
  behindWon: number;
  hits: number;
  leiKills: number;
  leiDecided: number;
  turns: number;
}

async function run(exclude: string[]): Promise<Result> {
  DECK_SPEC.splice(0, DECK_SPEC.length, ...FULL.filter((d) => !exclude.includes(d.key)));
  const r: Result = { wins: { lord: 0, rebel: 0, renegade: 0 }, behind: 0, behindWon: 0, hits: 0, leiKills: 0, leiDecided: 0, turns: 0 };
  for (let seed = 1; seed <= N; seed++) {
    const game = new Game({ controllers: [0, 1, 2, 3, 4].map(() => new BasicAI()), seed, maxTurns: 600 });
    let snap: { lordHp: number; rebelHp: number } | null = null;
    let lastHit = -1;
    let seen = 0;
    let leiKilledLast = false;
    game.subscribe(() => {
      for (; seen < game.log.length; seen++) {
        const ev = game.log[seen].event;
        if (ev?.type === 'turn') lastHit = -1;
        if (ev?.type === 'judge' && ev.what === 'tianlei' && ev.effective) {
          r.hits++;
          lastHit = ev.seat;
        }
        if (ev?.type === 'death') {
          leiKilledLast = ev.seat === lastHit;
          if (leiKilledLast) r.leiKills++;
        }
      }
      if (!snap && game.turn >= SNAP_TURN && game.phase !== 'over') {
        const hp = (roles: string[]) => game.players.filter((p) => p.alive && roles.includes(p.role)).reduce((s, p) => s + p.hp, 0);
        snap = { lordHp: hp(['lord', 'loyalist']), rebelHp: hp(['rebel']) };
      }
    });
    let winner: string;
    try {
      winner = await game.start();
    } catch {
      continue;
    }
    r.wins[winner]++;
    r.turns += game.turn;
    // 最后一次阵亡由天雷造成 → 天雷决定了这局的结束
    if (leiKilledLast) r.leiDecided++;
    const sn = snap as { lordHp: number; rebelHp: number } | null;
    if (sn && sn.lordHp !== sn.rebelHp) {
      const trailing = sn.lordHp < sn.rebelHp ? 'lord' : 'rebel';
      r.behind++;
      if (winner === trailing) r.behindWon++;
    }
  }
  return r;
}

const pct = (a: number, b: number) => `${((a / b) * 100).toFixed(1)}%`;
const variants: Array<[string, string[]]> = process.env.VARIANTS
  ? (JSON.parse(process.env.VARIANTS) as string[][]).map((ex) => [ex.length ? `-${ex.join('-')}` : '新牌堆', ex])
  : [
      ['原牌堆', NEW_KEYS],
      ['只加天雷', NEW_KEYS.filter((k) => k !== 'tianlei')],
      ['新牌堆', []],
    ];
const results: Result[] = [];
for (const [, ex] of variants) results.push(await run(ex));
DECK_SPEC.splice(0, DECK_SPEC.length, ...FULL);
const row = (label: string, f: (r: Result) => string) => console.log(label.padEnd(10) + results.map((r) => f(r).padStart(10)).join(''));
console.log(`${N} 局，快照：第 ${SNAP_TURN} 回合`);
console.log(''.padEnd(10) + variants.map(([l]) => l.padStart(8)).join('  '));
for (const w of ['lord', 'rebel', 'renegade']) row(w, (r) => pct(r.wins[w], N));
row('翻盘率', (r) => pct(r.behindWon, r.behind));
row('平均回合', (r) => (r.turns / N).toFixed(1));
row('天雷劈中/局', (r) => (r.hits / N).toFixed(2));
row('天雷终结', (r) => pct(r.leiDecided, N));
