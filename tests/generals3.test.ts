import { describe, expect, it } from 'vitest';
import { SHESHEN_DRAW } from '../src/engine/game';
import { give, makeGame, ROLES, Scripted } from './helpers';

// 身份：0 主公 1 忠臣 2 反贼 3 反贼 4 内奸
// 距离：0-1=1，0-4=1，0-2=2，0-3=2

async function setup(generals: string[]) {
  const ctrls = ROLES.map(() => new Scripted());
  return makeGame(ctrls, ROLES, { generals, skills: true });
}

const FILL = ['zhouyu', 'zhaoyun', 'lvbu', 'zhangliao', 'guojia'];
function gens(spec: Record<number, string>): string[] {
  const used = new Set(Object.values(spec));
  const filler = FILL.filter((g) => !used.has(g));
  return [0, 1, 2, 3, 4].map((s) => spec[s] ?? filler.shift()!);
}

const useZhan = (cardId: number, target: number) => {
  let used = false;
  return (_v: unknown, req: { type: string }) => {
    if (req.type !== 'play' || used) return undefined;
    used = true;
    return { type: 'use' as const, cardId, target };
  };
};

describe('第三批武将', () => {
  it('典韦【舍身】：代替距离 1 的角色承受伤害并摸两张牌，每回合限一次', async () => {
    const { game, ctrls } = await setup(gens({ 1: 'dianwei' }));
    ctrls[1].handler = (_v, req) => (req.type === 'choose' && req.reason === 'sheshen' ? 'yes' : undefined);
    game.current = 4;
    const z1 = give(game, 4, 'zhan');
    ctrls[4].handler = useZhan(z1.id, 0);
    await game.playPhase(game.players[4]);
    expect(game.players[0].hp).toBe(game.players[0].maxHp);
    expect(game.players[1].hp).toBe(game.players[1].maxHp - 1);
    expect(game.players[1].hand).toHaveLength(SHESHEN_DRAW);
    expect(game.help[1][0]).toBeGreaterThan(0);

    // 同一回合第二次伤害不能再发动
    await game.damage(4, 0, 1);
    expect(game.players[0].hp).toBe(game.players[0].maxHp - 1);
  });

  it('典韦不能替距离大于 1 的角色承受伤害；可以选择不发动', async () => {
    const { game, ctrls } = await setup(gens({ 1: 'dianwei' }));
    let asked = 0;
    ctrls[1].handler = (_v, req) => (req.type === 'choose' && req.reason === 'sheshen' ? (asked++, 'no') : undefined);
    await game.damage(0, 3, 1); // 1-3 距离 2
    expect(asked).toBe(0);
    await game.damage(4, 0, 1);
    expect(asked).toBe(1);
    expect(game.players[0].hp).toBe(game.players[0].maxHp - 1);
  });

  it('黄忠【宝刀】：装备牌当【斩】，计入次数；【斩】无视距离', async () => {
    const { game, ctrls } = await setup(gens({ 2: 'huangzhong' }));
    const eq = give(game, 2, 'qingcong');
    give(game, 2, 'zhan');
    game.current = 2;
    const opt = game.legalSkills(2).find((s) => s.skill === 'baodao')!;
    expect(opt.targets).toContain(0); // 距离 2 也可以
    let step = 0;
    ctrls[2].handler = (_v, req) => {
      if (req.type !== 'play') return undefined;
      if (step++ === 0) return { type: 'skill', skill: 'baodao', cards: [eq.id], targets: [0] };
      // 已用过一次，【斩】不再可用
      expect(req.options.some((o) => game.players[2].hand.find((c) => c.id === o.cardId)?.key === 'zhan')).toBe(false);
      return { type: 'end' };
    };
    await game.playPhase(game.players[2]);
    expect(game.players[0].hp).toBe(game.players[0].maxHp - 1);
    expect(game.zhanUsed).toBe(1);
    expect(game.discardPile).toContain(eq);
  });

  it('黄忠的普通【斩】也无视距离', async () => {
    const { game } = await setup(gens({ 2: 'huangzhong' }));
    const z = give(game, 2, 'zhan');
    game.current = 2;
    const opt = game.legalPlays(2).find((o) => o.cardId === z.id)!;
    expect(opt.targets.sort()).toEqual([0, 1, 3, 4]);
  });

  it('宝刀只能用装备牌', async () => {
    const { game } = await setup(gens({ 2: 'huangzhong' }));
    const z = give(game, 2, 'bi');
    give(game, 2, 'qingcong');
    game.current = 2;
    const opt = game.legalSkills(2).find((s) => s.skill === 'baodao')!;
    await game.useSkill(game.players[2], opt, [z.id], [0]);
    expect(game.players[0].hp).toBe(game.players[0].maxHp);
    expect(game.zhanUsed).toBe(0);
  });

  it('黄忠可以把装备牌当作【斩】打出（比武）', async () => {
    const { game, ctrls } = await setup(gens({ 2: 'huangzhong' }));
    const bw = give(game, 0, 'biwu');
    const eq = give(game, 2, 'qingcong');
    ctrls[0].handler = useZhan(bw.id, 2);
    ctrls[2].handler = (_v, req) => (req.type === 'respond' ? (expect(req.accept).toContain('qingcong'), eq.id) : undefined);
    await game.playPhase(game.players[0]);
    // 黄忠弃了装备，主公没有【斩】，主公受伤
    expect(game.players[0].hp).toBe(game.players[0].maxHp - 1);
    expect(game.players[2].hp).toBe(game.players[2].maxHp);
  });

  it('鲁肃【联盟】：交出一张牌，然后自己摸一张，每回合限一次', async () => {
    const { game } = await setup(gens({ 3: 'lusu' }));
    const c = give(game, 3, 'bi');
    give(game, 3, 'zhan');
    game.current = 3;
    const opt = game.legalSkills(3).find((s) => s.skill === 'lianmeng')!;
    await game.useSkill(game.players[3], opt, [c.id], [2]);
    expect(game.players[3].hand).toHaveLength(2);
    expect(game.players[2].hand).toHaveLength(1);
    expect(game.players[2].hand).toContain(c);
    expect(game.help[3][2]).toBeGreaterThan(0);
    expect(game.legalSkills(3).some((s) => s.skill === 'lianmeng')).toBe(false);
  });

  it('董卓【焚城】：对所有其他角色各造成 1 点伤害，然后失去 1 点体力，每局一次', async () => {
    const { game } = await setup(gens({ 4: 'dongzhuo' }));
    game.current = 4;
    const opt = game.legalSkills(4).find((s) => s.skill === 'fencheng')!;
    expect(opt.targets).toEqual([]);
    await game.useSkill(game.players[4], opt, [], []);
    for (const s of [0, 1, 2, 3]) expect(game.players[s].hp).toBe(game.players[s].maxHp - 1);
    expect(game.players[4].hp).toBe(game.players[4].maxHp - 1);
    game.turn++;
    game.skillUsed.clear();
    expect(game.legalSkills(4).some((s) => s.skill === 'fencheng')).toBe(false);
  });

  it('焚城击杀反贼可获得奖励；自己失去体力濒死时可以自救', async () => {
    const { game, ctrls } = await setup(gens({ 0: 'dongzhuo' }));
    game.players[2].hp = 1;
    game.players[0].hp = 1;
    const yao = give(game, 0, 'yao');
    ctrls[0].handler = (_v, req) => (req.type === 'respond' && req.reason.kind === 'save' && req.reason.dying === 0 ? yao.id : undefined);
    await game.fencheng(game.players[0]);
    expect(game.players[2].alive).toBe(false);
    expect(game.players[0].alive).toBe(true);
    expect(game.players[0].hp).toBe(1);
    expect(game.players[0].hand).toHaveLength(3); // 击杀反贼摸 3 张（【药】已用掉）
  });
});
