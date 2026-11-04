import { describe, expect, it } from 'vitest';
import type { Card } from '../src/engine/types';
import { equip, give, makeGame, ROLES, Scripted } from './helpers';

// 身份：0 主公 1 忠臣 2 反贼 3 反贼 4 内奸
// 距离：0-1=1，0-4=1，0-2=2，0-3=2

async function setup(generals: string[]) {
  const ctrls = ROLES.map(() => new Scripted());
  return makeGame(ctrls, ROLES, { generals, skills: true });
}

const FILL = ['zhouyu', 'diaochan', 'zhaoyun', 'lvbu', 'zhangliao'];
/** 指定若干座位的武将，其余用不相关的武将填充 */
function gens(spec: Record<number, string>): string[] {
  const used = new Set(Object.values(spec));
  const filler = FILL.filter((g) => !used.has(g));
  return [0, 1, 2, 3, 4].map((s) => spec[s] ?? filler.shift()!);
}

describe('魏', () => {
  it('曹操【霸业】：造成伤害后摸一张牌', async () => {
    const { game } = await setup(gens({ 0: 'caocao' }));
    await game.damage(0, 1, 1);
    expect(game.players[0].hand).toHaveLength(1);
  });

  it('曹操【号令】：魏势力角色可替主公出【避】', async () => {
    const { game, ctrls } = await setup(gens({ 0: 'caocao', 1: 'guojia', 3: 'zhangliao' }));
    const bi = give(game, 1, 'bi');
    give(game, 2, 'bi'); // 非魏势力，不应被询问
    ctrls[1].handler = (_v, req) => (req.type === 'respond' && req.reason.kind === 'haoling' ? bi.id : undefined);
    await game.resolveZhan(4, 0);
    expect(game.players[0].hp).toBe(5);
    expect(game.players[1].hand).toHaveLength(0);
    expect(ctrls[2].requests).toHaveLength(0);
  });

  it('【号令】只对主公曹操生效', async () => {
    const { game, ctrls } = await setup(gens({ 1: 'caocao', 2: 'guojia' }));
    const bi = give(game, 2, 'bi');
    ctrls[2].handler = (_v, req) => (req.type === 'respond' ? bi.id : undefined);
    await game.resolveZhan(0, 1);
    expect(game.players[1].hp).toBe(3);
  });

  it('郭嘉【谋算】：受伤后获得 1 张，其余按指定顺序放回', async () => {
    const { game, ctrls } = await setup(gens({ 1: 'guojia' }));
    const top = game.drawPile.slice(-3).reverse(); // 第一张为牌堆顶
    ctrls[1].handler = (_v, req) => {
      if (req.type === 'selectCards') return [top[2].id];
      if (req.type === 'orderCards') return [...req.cards].reverse().map((c) => c.id);
      return undefined;
    };
    await game.damage(null, 1, 1);
    expect(game.players[1].hand).toEqual([top[2]]);
    expect(game.drawPile.at(-1)).toBe(top[1]);
    expect(game.drawPile.at(-2)).toBe(top[0]);
  });

  it('张辽【先登】：少摸 1 张，本回合距离视为 1', async () => {
    const { game, ctrls } = await setup(gens({ 2: 'zhangliao' }));
    ctrls[2].handler = (_v, req) => (req.type === 'choose' ? 'yes' : undefined);
    game.current = 2;
    expect(game.distance(2, 0)).toBe(2);
    await game.drawPhase(game.players[2]);
    expect(game.players[2].hand).toHaveLength(1);
    expect(game.distance(2, 0)).toBe(1);
    expect(game.distance(0, 2)).toBe(2); // 只影响张辽到别人的距离
  });

  it('张辽【先登】：本回合可多用 1 张【斩】，【斩】造成伤害后摸一张牌', async () => {
    const { game, ctrls } = await setup(gens({ 2: 'zhangliao' }));
    ctrls[2].handler = (_v, req) => (req.type === 'choose' ? 'yes' : undefined);
    game.current = 2;
    const limit = game.zhanLimit;
    await game.drawPhase(game.players[2]);
    expect(game.zhanLimit).toBe(limit + 1);
    const before = game.players[2].hand.length;
    await game.resolveZhan(2, 0); // 主公没有【避】
    expect(game.players[0].hp).toBe(4);
    expect(game.players[2].hand).toHaveLength(before + 1);
  });

  it('张辽未发动【先登】时，【斩】造成伤害不摸牌', async () => {
    const { game, ctrls } = await setup(gens({ 2: 'zhangliao' }));
    ctrls[2].handler = (_v, req) => (req.type === 'choose' ? 'no' : undefined);
    game.current = 2;
    await game.drawPhase(game.players[2]);
    const before = game.players[2].hand.length;
    await game.resolveZhan(2, 1);
    expect(game.players[2].hand).toHaveLength(before);
  });

  it('张辽不发动【先登】时正常摸 2 张', async () => {
    const { game, ctrls } = await setup(gens({ 2: 'zhangliao' }));
    ctrls[2].handler = (_v, req) => (req.type === 'choose' ? 'no' : undefined);
    game.current = 2;
    await game.drawPhase(game.players[2]);
    expect(game.players[2].hand).toHaveLength(2);
    expect(game.distance(2, 0)).toBe(2);
  });
});

describe('蜀', () => {
  it('刘备【宽仁】：弃一张手牌令一名角色回复，出牌阶段限一次', async () => {
    const { game, ctrls } = await setup(gens({ 3: 'liubei' }));
    const a = give(game, 3, 'zhan');
    const b = give(game, 3, 'bi');
    game.players[1].hp = 1;
    let n = 0;
    ctrls[3].handler = (_v, req) =>
      req.type === 'play'
        ? n++ === 0
          ? { type: 'skill', skill: 'kuanren', cards: [a.id], targets: [1] }
          : { type: 'end' }
        : undefined;
    await game.playPhase(game.players[3]);
    expect(game.players[1].hp).toBe(2);
    expect(game.discardPile).toContain(a);
    expect(game.players[3].hand).toEqual([b]); // 没有被动摸牌
    expect(game.legalSkills(3)).toHaveLength(0); // 限一次
  });

  it('刘备【桃园】：其他蜀势力角色救主公时额外摸牌', async () => {
    const { game, ctrls } = await setup(gens({ 0: 'liubei', 1: 'zhugeliang' }));
    const yao = give(game, 1, 'yao');
    ctrls[1].handler = (_v, req) => (req.type === 'respond' && req.reason.kind === 'save' ? yao.id : undefined);
    game.players[0].hp = 1;
    await game.damage(null, 0, 1);
    expect(game.players[0].hp).toBe(1);
    expect(game.players[0].hand).toHaveLength(1);
  });

  it('诸葛亮【神算】：观看 3 张获得 2 张，另一张置底', async () => {
    const { game, ctrls } = await setup(gens({ 1: 'zhugeliang' }));
    const top = game.drawPile.slice(-3).reverse();
    ctrls[1].handler = (_v, req) => (req.type === 'selectCards' ? [top[0].id, top[2].id] : undefined);
    await game.drawPhase(game.players[1]);
    expect(game.players[1].hand).toEqual(expect.arrayContaining([top[0], top[2]]));
    expect(game.players[1].hand).toHaveLength(2);
    expect(game.drawPile[0]).toBe(top[1]);
  });

  it('诸葛亮的锦囊不能被【识破】', async () => {
    const { game, ctrls } = await setup(gens({ 1: 'zhugeliang' }));
    const sp = give(game, 2, 'shipo');
    ctrls[2].handler = (_v, req) => (req.type === 'respond' ? sp.id : undefined);
    const tb = give(game, 1, 'tiaobing');
    game.takeFromHand(game.players[1], tb.id);
    await game.useCard(game.players[1], tb);
    expect(game.players[1].hand).toHaveLength(3); // 调兵 2 张 + 神算 1 张
    expect(game.players[2].hand).toEqual([sp]);
  });

  it('诸葛亮【神算】：每回合只有第一次使用锦囊时摸牌', async () => {
    const { game } = await setup(gens({ 1: 'zhugeliang' }));
    game.current = 1;
    game.shensuanDrawn = false;
    for (let i = 0; i < 2; i++) {
      const tb = give(game, 1, 'tiaobing');
      game.takeFromHand(game.players[1], tb.id);
      await game.useCard(game.players[1], tb);
    }
    expect(game.players[1].hand).toHaveLength(5); // 2 + 1 + 2
  });

  it('赵云【七进】：可用 2 张【斩】，被【避】抵消后不摸牌', async () => {
    const { game, ctrls } = await setup(gens({ 4: 'zhaoyun' }));
    game.current = 4;
    await game.runTurn(4);
    expect(game.zhanLimit).toBe(2);
    const handBefore = game.players[4].hand.length;
    const bi = give(game, 0, 'bi');
    ctrls[0].handler = (_v, req) => (req.type === 'respond' ? bi.id : undefined);
    await game.resolveZhan(4, 0);
    expect(game.players[4].hand).toHaveLength(handBefore);
  });
});

describe('吴', () => {
  it('孙权【坐断】：结束阶段摸至体力值', async () => {
    const { game } = await setup(gens({ 4: 'sunquan' }));
    game.current = 4;
    await game.runTurn(4);
    expect(game.players[4].hand).toHaveLength(4);
  });

  it('孙权【江东】：吴势力角色阵亡时主公回复', async () => {
    const { game } = await setup(gens({ 0: 'sunquan', 2: 'zhouyu' }));
    game.players[0].hp = 3;
    game.players[2].hp = 1;
    await game.damage(null, 2, 1);
    expect(game.players[2].alive).toBe(false);
    expect(game.players[0].hp).toBe(4);
  });

  it('周瑜【火计】：弃两张同花色手牌造成伤害', async () => {
    const { game, ctrls } = await setup(gens({ 0: 'zhouyu' }));
    const a = game.drawPile.find((c) => c.suit === 'spade')!;
    const b = game.drawPile.find((c) => c.suit === 'spade' && c !== a)!;
    for (const c of [a, b]) {
      game.drawPile.splice(game.drawPile.indexOf(c), 1);
      game.players[0].hand.push(c);
    }
    let n = 0;
    ctrls[0].handler = (_v, req) =>
      req.type === 'play' ? (n++ === 0 ? { type: 'skill', skill: 'huoji', cards: [a.id, b.id], targets: [3] } : { type: 'end' }) : undefined;
    await game.playPhase(game.players[0]);
    expect(game.players[3].hp).toBe(3);
    expect(game.players[0].hand).toHaveLength(0);
  });

  it('【火计】花色不同则无效', async () => {
    const { game, ctrls } = await setup(gens({ 0: 'zhouyu' }));
    const pick = (suit: string) => {
      const c = game.drawPile.find((x) => x.suit === suit)!;
      game.drawPile.splice(game.drawPile.indexOf(c), 1);
      game.players[0].hand.push(c);
      return c;
    };
    const a = pick('spade');
    const b = pick('heart');
    pick('heart'); // 使技能可发动
    let n = 0;
    ctrls[0].handler = (_v, req) =>
      req.type === 'play' ? (n++ === 0 ? { type: 'skill', skill: 'huoji', cards: [a.id, b.id], targets: [3] } : { type: 'end' }) : undefined;
    await game.playPhase(game.players[0]);
    expect(game.players[3].hp).toBe(4);
    expect(game.players[0].hand).toHaveLength(3);
  });
});

describe('群', () => {
  it('吕布【骁勇】：攻击范围 +1，【斩】造成伤害后弃置目标装备', async () => {
    const { game } = await setup(gens({ 0: 'lvbu' }));
    expect(game.attackRange(0)).toBe(2);
    expect(game.inAttackRange(0, 2)).toBe(true);
    const horse: Card = equip(game, 2, 'qingcong');
    expect(game.inAttackRange(0, 2)).toBe(false);
    game.players[2].equips = {};
    game.drawPile.push(horse);
    const armor = equip(game, 1, 'yulinjia');
    await game.resolveZhan(0, 1); // 鱼鳞甲无基础牌可弃，伤害生效
    expect(game.players[1].hp).toBe(game.players[1].maxHp - 1);
    expect(game.players[1].equips.armor).toBeUndefined();
    expect(game.discardPile).toContain(armor);
  });

  it('貂蝉【惑心】：前者对后者使用【斩】', async () => {
    const { game, ctrls } = await setup(gens({ 0: 'diaochan' }));
    const z = give(game, 1, 'zhan');
    ctrls[1].handler = (_v, req) => (req.type === 'respond' && req.reason.kind === 'huoxin' ? z.id : undefined);
    const opt = game.legalSkills(0)[0];
    expect(opt.secondTargets![1]).toEqual([2]);
    await game.useSkill(game.players[0], opt, [], [1, 2]);
    expect(game.players[2].hp).toBe(3);
    expect(game.players[1].hand).toHaveLength(0);
  });

  it('貂蝉【惑心】：不出【斩】则交给貂蝉一张手牌', async () => {
    const { game } = await setup(gens({ 0: 'diaochan' }));
    const c = give(game, 1, 'bi');
    const opt = game.legalSkills(0)[0];
    await game.useSkill(game.players[0], opt, [], [1, 2]);
    expect(game.players[0].hand).toEqual([c]);
    expect(game.players[2].hp).toBe(4);
  });

  it('【惑心】后者不在前者攻击范围内则无效', async () => {
    const { game } = await setup(gens({ 0: 'diaochan' }));
    give(game, 1, 'bi');
    const opt = game.legalSkills(0)[0];
    await game.useSkill(game.players[0], opt, [], [1, 3]);
    expect(game.players[0].hand).toHaveLength(0);
    expect(game.skillUsed.has('huoxin')).toBe(false);
  });
});
