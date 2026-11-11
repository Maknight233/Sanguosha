import { describe, expect, it } from 'vitest';
import { JUZHONG_MAX, TAOHUI_DRAW } from '../src/engine/game';
import { give, makeGame, ROLES, Scripted } from './helpers';

// 身份：0 主公 1 忠臣 2 反贼 3 反贼 4 内奸
// 距离：0-1=1，0-4=1，0-2=2，0-3=2

async function setup(generals: string[]) {
  const ctrls = ROLES.map(() => new Scripted());
  return makeGame(ctrls, ROLES, { generals, skills: true });
}

const FILL = ['zhouyu', 'diaochan', 'zhaoyun', 'lvbu', 'zhangliao'];
function gens(spec: Record<number, string>): string[] {
  const used = new Set(Object.values(spec));
  const filler = FILL.filter((g) => !used.has(g));
  return [0, 1, 2, 3, 4].map((s) => spec[s] ?? filler.shift()!);
}

describe('第二批武将', () => {
  it('司马懿【韬晦】：本回合未造成伤害，结束阶段摸牌', async () => {
    const { game } = await setup(gens({ 1: 'simayi' }));
    game.current = 1;
    await game.runTurn(1);
    // 摸牌阶段 2 张 + 韬晦（在弃牌阶段之后）
    expect(game.players[1].hand).toHaveLength(2 + TAOHUI_DRAW);
  });

  it('司马懿【韬晦】：手牌数不小于体力时只摸一张', async () => {
    const { game } = await setup(gens({ 1: 'simayi' }));
    give(game, 1, 'zhan');
    game.current = 1;
    await game.runTurn(1);
    // 摸牌后 3 张 = 体力 3，不用弃牌；韬晦摸 1
    expect(game.players[1].hand).toHaveLength(3 + TAOHUI_DRAW - 1);
  });

  it('司马懿本回合造成过伤害则不发动【韬晦】', async () => {
    const { game, ctrls } = await setup(gens({ 1: 'simayi' }));
    const zhan = give(game, 1, 'zhan');
    let used = false;
    ctrls[1].handler = (_v, req) => {
      if (req.type === 'play' && !used) {
        used = true;
        return { type: 'use', cardId: zhan.id, target: 0 };
      }
      return undefined;
    };
    game.current = 1;
    await game.runTurn(1);
    expect(game.players[0].hp).toBe(game.players[0].maxHp - 1);
    expect(game.players[1].hand).toHaveLength(2);
  });

  it('关羽【过关】：存活不多于 3 人时多摸 1 张、多 1 次【斩】', async () => {
    const { game } = await setup(gens({ 1: 'guanyu' }));
    game.current = 1;
    await game.drawPhase(game.players[1]);
    expect(game.players[1].hand).toHaveLength(2);

    game.players[2].alive = false;
    game.players[3].alive = false;
    game.players[1].hand = [];
    await game.drawPhase(game.players[1]);
    expect(game.players[1].hand).toHaveLength(3);
    expect(game.guoguan(1)).toBe(true);
  });

  it('关羽回合中人数降到 3 人时，本回合立即多 1 次【斩】', async () => {
    const { game } = await setup(gens({ 1: 'guanyu' }));
    game.current = 1;
    game.zhanLimit = 1;
    game.players[2].alive = false;
    game.players[3].hp = 0;
    await game.kill(3, 1);
    expect(game.zhanLimit).toBe(2);
  });

  it('陆逊【持重】：回合外打出【避】后摸一张牌', async () => {
    const { game, ctrls } = await setup(gens({ 2: 'luxun' }));
    const bi = give(game, 2, 'bi');
    ctrls[2].handler = (_v, req) => (req.type === 'respond' ? bi.id : undefined);
    game.current = 0;
    await game.resolveZhan(0, 2);
    expect(game.players[2].hp).toBe(game.players[2].maxHp);
    expect(game.players[2].hand).toHaveLength(1);
    expect(game.players[2].hand[0]).not.toBe(bi);
  });

  it('陆逊在自己回合内打出【避】不发动【持重】', async () => {
    const { game, ctrls } = await setup(gens({ 2: 'luxun' }));
    const bi = give(game, 2, 'bi');
    ctrls[2].handler = (_v, req) => (req.type === 'respond' ? bi.id : undefined);
    game.current = 2;
    await game.resolveZhan(3, 2);
    expect(game.players[2].hand).toHaveLength(0);
  });

  it('甘宁【锦帆】：【斩】造成伤害后获得目标一张手牌', async () => {
    const { game } = await setup(gens({ 1: 'ganning' }));
    const card = give(game, 2, 'tiaobing');
    await game.resolveZhan(1, 2);
    expect(game.players[2].hand).toHaveLength(0);
    expect(game.players[1].hand).toEqual([card]);
  });

  it('甘宁可以不发动【锦帆】', async () => {
    const { game, ctrls } = await setup(gens({ 1: 'ganning' }));
    give(game, 2, 'tiaobing');
    ctrls[1].handler = (_v, req) => (req.type === 'choose' ? 'no' : undefined);
    await game.resolveZhan(1, 2);
    expect(game.players[2].hand).toHaveLength(1);
    expect(game.players[1].hand).toHaveLength(0);
  });

  it('华佗【养生】：准备阶段已受伤时弃一张手牌回复 1 点体力，然后摸一张牌', async () => {
    const { game } = await setup(gens({ 3: 'huatuo' }));
    const card = give(game, 3, 'zhan');
    game.players[3].hp = 1;
    await game.yangsheng(game.players[3]);
    expect(game.players[3].hp).toBe(2);
    expect(game.discardPile).toContain(card);
    expect(game.players[3].hand).toHaveLength(1);
    expect(game.players[3].hand[0]).not.toBe(card);
  });

  it('华佗【养生】：回复后体力大于 2 时不摸牌', async () => {
    const { game } = await setup(gens({ 3: 'huatuo' }));
    give(game, 3, 'zhan');
    game.players[3].hp = 2;
    await game.yangsheng(game.players[3]);
    expect(game.players[3].hp).toBe(3);
    expect(game.players[3].hand).toHaveLength(0);
  });

  it('华佗【养生】弃置【药】时不摸牌', async () => {
    const { game } = await setup(gens({ 3: 'huatuo' }));
    give(game, 3, 'yao');
    game.players[3].hp = 1;
    await game.yangsheng(game.players[3]);
    expect(game.players[3].hp).toBe(2);
    expect(game.players[3].hand).toHaveLength(0);
  });

  it('华佗满体力或没有手牌时不询问【养生】', async () => {
    const { game, ctrls } = await setup(gens({ 3: 'huatuo' }));
    give(game, 3, 'zhan');
    await game.yangsheng(game.players[3]);
    game.players[3].hp = 1;
    game.players[3].hand = [];
    await game.yangsheng(game.players[3]);
    expect(ctrls[3].requests).toHaveLength(0);
  });

  it(`张角【聚众】：其他角色阵亡后上限 +1 并回复，最多 +${JUZHONG_MAX}`, async () => {
    const { game } = await setup(gens({ 4: 'zhangjiao' }));
    const z = game.players[4];
    z.hp = 2;
    for (const s of [1, 2, 3]) {
      game.players[s].hp = 0;
      try {
        await game.kill(s, null);
      } catch {
        // 第三人阵亡后可能分出胜负
      }
    }
    expect(z.maxHp).toBe(4 + JUZHONG_MAX);
    expect(z.hp).toBe(2 + JUZHONG_MAX);
  });
});
