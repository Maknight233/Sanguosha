/**
 * 用法：npx vite-node scripts/disguise.ts [局数]
 * 统计「读局」（旁观者视角）的识别准确率：每回合开始时，对每个身份未公开的存活角色，
 * 忠臣被判「偏忠」、反贼被判「偏反」、内奸被标「疑似内奸」的比例，以及被判反的比例（误判）。
 * 人数：PLAYERS=5…8；伪装参数：DISGUISE='{"enabled":false}'。
 */
import { BasicAI, DISGUISE_TUNING, observerOpinions } from '../src/ai/basic';
import { Game } from '../src/engine/game';

Object.assign(DISGUISE_TUNING, JSON.parse(process.env.DISGUISE ?? '{}'));
const N = Number(process.argv[2] ?? 500);
const PLAYERS = Number(process.env.PLAYERS ?? 5);
const c: Record<string, [number, number]> = {};
const add = (k: string, ok: boolean) => {
  const v = (c[k] ??= [0, 0]);
  v[0] += ok ? 1 : 0;
  v[1]++;
};
const wins: Record<string, number> = {};
for (let seed = 1; seed <= N; seed++) {
  const game = new Game({ controllers: Array.from({ length: PLAYERS }, () => new BasicAI()), seed, maxTurns: 500 });
  const lord = () => game.players.find((p) => p.role === 'lord')!.seat;
  game.subscribe(() => {
    const e = game.log[game.log.length - 1]?.event;
    if (e?.type !== 'turn') return;
    const round = Math.ceil(game.turn / PLAYERS);
    const ops = observerOpinions(game.view(lord()));
    for (const p of game.players) {
      const op = ops[p.seat];
      if (!op) continue;
      const phase = round <= 2 ? '前 2 轮' : '之后';
      if (p.role === 'loyalist') add(`${phase} 忠臣判忠`, op.verdict === 'loyal');
      if (p.role === 'rebel') add(`${phase} 反贼判反`, op.verdict === 'rebel');
      if (p.role === 'rebel') add(`${phase} 反贼被判忠`, op.verdict === 'loyal');
      if (p.role === 'renegade') add(`${phase} 内奸被疑`, op.suspected);
    }
  });
  try {
    const w = await game.start();
    wins[w] = (wins[w] ?? 0) + 1;
  } catch {
    wins.stuck = (wins.stuck ?? 0) + 1;
  }
}
console.log(`${PLAYERS} 人 ${N} 局，伪装 ${JSON.stringify(DISGUISE_TUNING)}`, wins);
for (const k of Object.keys(c).sort()) console.log(k, `${((c[k][0] / c[k][1]) * 100).toFixed(1)}%`);
