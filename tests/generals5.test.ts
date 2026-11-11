import { describe, expect, it } from 'vitest';
import { BasicAI } from '../src/ai/basic';
import type { Request } from '../src/engine/types';
import { equip, give, makeGame, ROLES, Scripted } from './helpers';

// 身份：0 主公 1 忠臣 2 反贼 3 反贼 4 内奸
// 距离：0-1=1，0-4=1，0-2=2，0-3=2，1-2=1

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

describe('曹仁【坚城】', () => {
  it('结束阶段装备 ≥ 2 件时摸 1 张；只有 1 件装备时不摸', async () => {
    const { game } = await setup(gens({ 1: 'caoren' }));
    equip(game, 1, 'huanshoudao');
    equip(game, 1, 'yulinjia');
    equip(game, 1, 'qiji');
    await game.runTurn(1);
    expect(game.players[1].hand).toHaveLength(2 + 1); // 摸牌阶段 2 + 坚城 1（3 件装备也只摸 1）

    const { game: g2 } = await setup(gens({ 1: 'caoren' }));
    equip(g2, 1, 'huanshoudao');
    await g2.runTurn(1);
    expect(g2.players[1].hand).toHaveLength(2);
  });
});

describe('张飞【夺械】', () => {
  it('获得距离 1 以内角色的一件装备，对方摸一张；每回合限一次', async () => {
    const { game, ctrls } = await setup(gens({ 1: 'zhangfei' }));
    const armor = equip(game, 2, 'yulinjia');
    equip(game, 2, 'qiji');
    equip(game, 3, 'suozijia'); // 距离 2，不能选
    game.current = 1;
    const opt = game.legalSkills(1).find((s) => s.skill === 'duoxie')!;
    expect(opt.targets).toEqual([2]);
    ctrls[1].handler = (_v, req) => (req.type === 'selectCards' && req.reason === 'duoxie' ? [armor.id] : undefined);
    const total = game.totalCards();
    await game.useSkill(game.players[1], opt, [], [2]);
    expect(game.players[1].hand).toContain(armor);
    expect(game.players[2].equips.armor).toBeUndefined();
    expect(game.players[2].hand).toHaveLength(1);
    expect(game.totalCards()).toBe(total);
    expect(game.legalSkills(1).some((s) => s.skill === 'duoxie')).toBe(false);
  });
});

describe('太史慈【死战】', () => {
  it('可将装备区的牌当【避】打出，然后摸一张', async () => {
    const { game, ctrls } = await setup(gens({ 2: 'taishici' }));
    const horse = equip(game, 2, 'qiji');
    ctrls[2].handler = (_v, req) => (req.type === 'respond' && req.equipDodge?.length ? horse.id : undefined);
    await game.resolveZhan(1, 2);
    expect(game.players[2].hp).toBe(4);
    expect(game.players[2].equips.horseMinus).toBeUndefined();
    expect(game.discardPile).toContain(horse);
    expect(game.players[2].hand).toHaveLength(1);
  });

  it('不用于【檄文】等需要弃基础牌的场合', async () => {
    const { game, ctrls } = await setup(gens({ 2: 'taishici' }));
    equip(game, 2, 'qiji');
    const asked: unknown[] = [];
    ctrls[2].handler = (_v, req) => (req.type === 'respond' && asked.push(req), undefined);
    const xw = give(game, 0, 'xiwen');
    game.takeFromHand(game.players[0], xw.id);
    await game.useCard(game.players[0], xw);
    expect(asked).toHaveLength(0); // 没有基础牌，也不能用装备
    expect(game.players[2].hp).toBe(3);
  });

  it('AI：没有【避】时用装备，优先用坐骑而不是防具', async () => {
    const { game } = await setup(gens({ 2: 'taishici' }));
    const armor = equip(game, 2, 'yulinjia');
    const horse = equip(game, 2, 'qiji');
    const ai = new BasicAI();
    const view = game.view(2);
    const req = { type: 'respond', accept: ['bi'], reason: { kind: 'dodge', source: 1 }, equipDodge: [armor, horse] } satisfies Request;
    expect(await ai.decide(view, req)).toBe(horse.id);
    // 有【避】时用【避】；但手里有同类备用装备时先用装备区那件
    const bi = give(game, 2, 'bi');
    expect(await ai.decide(game.view(2), req)).toBe(bi.id);
    give(game, 2, 'suozijia');
    expect(await ai.decide(game.view(2), req)).toBe(armor.id);
  });
});

describe('公孙瓒【白马】', () => {
  it('使用装备牌时摸一张；有坐骑时攻击范围 +1', async () => {
    const { game } = await setup(gens({ 1: 'gongsunzan' }));
    expect(game.attackRange(1)).toBe(1);
    const horse = give(game, 1, 'qingcong');
    game.takeFromHand(game.players[1], horse.id);
    await game.useCard(game.players[1], horse);
    expect(game.players[1].hand).toHaveLength(1);
    expect(game.attackRange(1)).toBe(2);
  });
});
