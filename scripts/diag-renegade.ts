/** 诊断：内奸死在什么阶段、被谁打死、死前谁打得最多 */
import { BasicAI, RENEGADE_TUNING } from '../src/ai/basic';
Object.assign(RENEGADE_TUNING, JSON.parse(process.env.TUNING ?? '{}'));
import { Game } from '../src/engine/game';
const N = Number(process.argv[2] ?? 1000);
const c: Record<string, number> = {};
const inc = (k: string) => (c[k] = (c[k] ?? 0) + 1);
for (let seed = 1; seed <= N; seed++) {
  const game = new Game({ controllers: [0, 1, 2, 3, 4].map(() => new BasicAI()), seed, maxTurns: 500 });
  const orig = game.kill.bind(game);
  let balanceStart: number | undefined;
  let h0: { lo: number; ro: number; help: number } | undefined;
  game.kill = async (seat: number, killer: number | null) => {
    const p = game.players[seat];
    const alive = (r: string) => game.players.filter((x) => x.alive && x.role === r).length;
    if (p.role === 'rebel' && alive('rebel') === 1 && alive('loyalist') === 1 && alive('renegade') === 1) {
      const rg = game.players.find((x) => x.role === 'renegade')!;
      const lo = game.players.findIndex((x) => x.role === 'loyalist');
      const ri = game.players.indexOf(rg);
      const ro = game.players.findIndex((x) => x.alive && x.role === 'rebel');
      inc(`末反贼死 平衡期内奸打忠臣 ${Math.min(5, Math.round(game.hostility[ri][lo] - (h0?.lo ?? 0)))}`);
      inc(`末反贼死 平衡期内奸打反贼 ${Math.min(5, Math.round(game.hostility[ri][ro] - (h0?.ro ?? 0)))}`);
      inc(`末反贼死 平衡期内奸救反贼 ${Math.round(game.help[ri][ro] - (h0?.help ?? 0))}`);
      inc(`末反贼死 击杀者 ${killer === null ? '无' : game.players[killer].role}`);
      inc(`末反贼死 内奸有药 ${rg.hand.some((c) => c.key === 'yao')}`);
      inc(`末反贼死 平衡持续回合 ${Math.min(10, game.turn - (balanceStart ?? game.turn))}`);
      inc(`末反贼死 内奸体力 ${rg.hp} 忠臣体力 ${game.players.find((x) => x.role === 'loyalist')!.hp}`);
    }
    if (p.role === 'rebel' && alive('rebel') === 2 && alive('loyalist') === 1) {
      balanceStart = game.turn;
      const lo = game.players.findIndex((x) => x.role === 'loyalist');
      const ri = game.players.findIndex((x) => x.role === 'renegade');
      const ro = game.players.findIndex((x, i) => i !== seat && x.alive && x.role === 'rebel');
      h0 = { lo: game.hostility[ri][lo], ro: game.hostility[ri][ro], help: game.help[ri][ro] };
    }
    if (p.role === 'renegade') {
      const alive = game.players.filter((x) => x.alive).length;
      inc(`死亡时存活人数(含自己) ${alive}`);
      inc(`死亡时存活 ${game.players.filter((x) => x.alive).map((x) => x.role).sort().join(',')}`);
      inc(`击杀者 ${killer === null ? '无' : game.players[killer].role}`);
      inc(`死亡前已死 ${game.deathOrder.map((s) => game.players[s].role).join(',') || '无人'}`);
      const h = game.players.map((x, i) => [x.role, game.hostility[i][seat]] as const).filter(([, v]) => v > 0);
      for (const [r, v] of h) c[`受到敌对 来自 ${r}`] = (c[`受到敌对 来自 ${r}`] ?? 0) + v;
      const mine = game.players.map((x, i) => [x.role, game.hostility[seat][i]] as const).filter(([, v]) => v > 0);
      for (const [r, v] of mine) c[`内奸发出敌对 对 ${r}`] = (c[`内奸发出敌对 对 ${r}`] ?? 0) + v;
    }
    return orig(seat, killer);
  };
  try {
    const w = await game.start();
    inc(`胜者 ${w}`);
    const rg = game.players.find((x) => x.role === 'renegade')!;
    inc(`结局 ${w} 内奸${rg.alive ? '存活' : '已死'} 存活 ${game.players.filter((x) => x.alive).map((x) => x.role).sort().join(',')}`);
  } catch { inc('卡住'); }
}
for (const k of Object.keys(c).sort()) console.log(k, typeof c[k] === 'number' ? +c[k].toFixed(1) : c[k]);
