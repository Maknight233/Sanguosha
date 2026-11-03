import { describe, expect, it } from 'vitest';
import { isRed } from '../src/data/cards';
import type { Game } from '../src/engine/game';
import type { Card } from '../src/engine/types';
import { equip, give, makeGame } from './helpers';

// 座位：0 主公曹操(5) 1 忠臣郭嘉(3) 2 反贼张辽(4) 3 反贼刘备(4) 4 内奸赵云(4)
// 距离：0-1=1，0-4=1，0-2=2，0-3=2

async function use(game: Game, seat: number, key: string, target?: number, extra?: number) {
  const card = give(game, seat, key);
  game.takeFromHand(game.players[seat], card.id);
  await game.useCard(game.players[seat], card, target, extra);
}

function giveWhere(game: Game, seat: number, pred: (c: Card) => boolean): Card {
  const i = game.drawPile.findIndex(pred);
  const card = game.drawPile.splice(i, 1)[0];
  game.players[seat].hand.push(card);
  return card;
}

describe('锦囊', () => {
  it('【调兵】摸两张牌', async () => {
    const { game } = await makeGame();
    await use(game, 0, 'tiaobing');
    expect(game.players[0].hand).toHaveLength(2);
  });

  it('【识破】抵消锦囊', async () => {
    const { game, ctrls } = await makeGame();
    const sp = give(game, 2, 'shipo');
    ctrls[2].handler = (_v, req) => (req.type === 'respond' ? sp.id : undefined);
    await use(game, 0, 'tiaobing');
    expect(game.players[0].hand).toHaveLength(0);
    expect(game.players[2].hand).toHaveLength(0);
  });

  it('【识破】可以被【识破】抵消', async () => {
    const { game, ctrls } = await makeGame();
    const sp2 = give(game, 2, 'shipo');
    const sp0 = give(game, 0, 'shipo');
    ctrls[2].handler = (_v, req) =>
      req.type === 'respond' && req.reason.kind === 'shipo' && !req.reason.countering ? sp2.id : undefined;
    ctrls[0].handler = (_v, req) =>
      req.type === 'respond' && req.reason.kind === 'shipo' && req.reason.countering ? sp0.id : undefined;
    await use(game, 0, 'tiaobing');
    expect(game.players[0].hand).toHaveLength(2); // 两张新摸的牌
    expect(game.players[0].hand).not.toContain(sp0);
  });

  it('【劫营】可指定弃置装备', async () => {
    const { game, ctrls } = await makeGame();
    const horse = equip(game, 2, 'qiji');
    give(game, 2, 'zhan');
    ctrls[0].handler = (_v, req) => (req.type === 'chooseCard' ? { zone: 'equip', cardId: horse.id } : undefined);
    await use(game, 0, 'jieying', 2);
    expect(game.players[2].equips.horseMinus).toBeUndefined();
    expect(game.players[2].hand).toHaveLength(1);
    expect(game.discardPile).toContain(horse);
  });

  it('【劫营】选手牌时随机弃置一张', async () => {
    const { game } = await makeGame();
    const c = give(game, 2, 'bi');
    await use(game, 0, 'jieying', 2);
    expect(game.players[2].hand).toHaveLength(0);
    expect(game.discardPile).toContain(c);
  });

  it('【策反】获得牌，且只能对距离 1 以内的角色使用', async () => {
    const { game } = await makeGame();
    give(game, 1, 'bi');
    give(game, 2, 'bi');
    const cf = give(game, 0, 'cefan');
    const opt = game.legalPlays(0).find((o) => o.cardId === cf.id)!;
    expect(opt.targets).toEqual([1]);
    game.takeFromHand(game.players[0], cf.id);
    await game.useCard(game.players[0], cf, 1);
    expect(game.players[0].hand.map((c) => c.key)).toEqual(['bi']);
    expect(game.players[1].hand).toHaveLength(0);
  });

  it('【檄文】不弃基础牌则受到伤害', async () => {
    const { game, ctrls } = await makeGame();
    const bi = give(game, 1, 'bi');
    ctrls[1].handler = (_v, req) => (req.type === 'respond' ? bi.id : undefined);
    await use(game, 0, 'xiwen');
    expect(game.players[1].hp).toBe(3);
    expect(game.players[2].hp).toBe(3);
    expect(game.players[3].hp).toBe(3);
    expect(game.players[4].hp).toBe(3);
    expect(game.players[0].hp).toBe(5);
  });

  it('【比武】先不弃【斩】的一方受伤', async () => {
    const { game, ctrls } = await makeGame();
    const z = give(game, 2, 'zhan');
    ctrls[2].handler = (_v, req) => (req.type === 'respond' ? z.id : undefined);
    await use(game, 0, 'biwu', 2);
    expect(game.players[2].hp).toBe(4);
    expect(game.players[0].hp).toBe(4);
  });

  it('【比武】目标无【斩】直接受伤', async () => {
    const { game } = await makeGame();
    await use(game, 0, 'biwu', 2);
    expect(game.players[2].hp).toBe(3);
  });

  it('【休整】受伤者可回复，满体力者摸牌', async () => {
    const { game } = await makeGame();
    game.players[1].hp = 1;
    await use(game, 0, 'xiuzheng');
    expect(game.players[1].hp).toBe(2);
    expect(game.players[1].hand).toHaveLength(0);
    for (const s of [0, 2, 3, 4]) expect(game.players[s].hand).toHaveLength(1);
  });
});

describe('武器', () => {
  it('【神臂弓】不能【斩】距离 1 的角色', async () => {
    const { game } = await makeGame();
    equip(game, 0, 'shenbigong');
    give(game, 0, 'zhan');
    expect(game.legalPlays(0)[0].targets).toEqual([2, 3]);
  });

  it('【镔铁大戟】可额外指定相邻角色', async () => {
    const { game, ctrls } = await makeGame();
    equip(game, 0, 'bintieji');
    const z = give(game, 0, 'zhan');
    const opt = game.legalPlays(0)[0];
    expect(opt.extraTargets![1]).toEqual([2]);
    ctrls[0].handler = (_v, req) =>
      req.type === 'play' && req.options.length ? { type: 'use', cardId: z.id, target: 1, extraTarget: 2 } : undefined;
    await game.playPhase(game.players[0]);
    expect(game.players[1].hp).toBe(2);
    expect(game.players[2].hp).toBe(3);
  });

  it('【镔铁大戟】非法额外目标被拒绝', async () => {
    const { game, ctrls } = await makeGame();
    equip(game, 0, 'bintieji');
    const z = give(game, 0, 'zhan');
    let n = 0;
    ctrls[0].handler = (_v, req) =>
      req.type === 'play' ? (n++ === 0 ? { type: 'use', cardId: z.id, target: 1, extraTarget: 3 } : { type: 'end' }) : undefined;
    await game.playPhase(game.players[0]);
    expect(game.players[3].hp).toBe(4);
    expect(game.players[0].hand).toHaveLength(1);
  });

  it('【环首刀】目标手牌更多时摸一张', async () => {
    const { game } = await makeGame();
    equip(game, 0, 'huanshoudao');
    give(game, 1, 'zhan');
    await use(game, 0, 'zhan', 1);
    expect(game.players[0].hand).toHaveLength(1);
  });

  it('【铁脊长枪】两张同颜色手牌当【避】', async () => {
    const { game, ctrls } = await makeGame();
    equip(game, 1, 'tiejiqiang');
    const a = giveWhere(game, 1, (c) => c.key !== 'bi' && isRed(c));
    const b = giveWhere(game, 1, (c) => c.key !== 'bi' && isRed(c));
    ctrls[1].handler = (_v, req) => (req.type === 'respond' && req.allowPair ? [a.id, b.id] : undefined);
    await use(game, 0, 'zhan', 1);
    expect(game.players[1].hp).toBe(3);
    expect(game.players[1].hand).toHaveLength(0);
  });

  it('【铁脊长枪】颜色不同则无效', async () => {
    const { game, ctrls } = await makeGame();
    equip(game, 1, 'tiejiqiang');
    const a = giveWhere(game, 1, (c) => c.key !== 'bi' && isRed(c));
    const b = giveWhere(game, 1, (c) => c.key !== 'bi' && !isRed(c));
    giveWhere(game, 1, (c) => c.key !== 'bi' && isRed(c)); // 使 allowPair 成立
    ctrls[1].handler = (_v, req) => (req.type === 'respond' ? [a.id, b.id] : undefined);
    await use(game, 0, 'zhan', 1);
    expect(game.players[1].hp).toBe(2);
  });
});

describe('防具', () => {
  it('【鱼鳞甲】每回合第一次【斩】伤害可弃基础牌防止', async () => {
    const { game, ctrls } = await makeGame();
    equip(game, 1, 'yulinjia');
    const y = give(game, 1, 'yao');
    give(game, 1, 'yao');
    ctrls[1].handler = (view, req) =>
      req.type === 'respond' && req.reason.kind === 'yulin' ? view.players[1].hand![0].id : undefined;
    await use(game, 0, 'zhan', 1);
    expect(game.players[1].hp).toBe(3);
    expect(game.discardPile).toContain(y);
    await use(game, 0, 'zhan', 1);
    expect(game.players[1].hp).toBe(2);
  });

  it('【鱼鳞甲】对非【斩】伤害无效', async () => {
    const { game } = await makeGame();
    equip(game, 2, 'yulinjia');
    give(game, 2, 'yao');
    await use(game, 0, 'biwu', 2);
    expect(game.players[2].hp).toBe(3);
  });

  it('【护心镜】体力为 1 时伤害 -1，然后弃置', async () => {
    const { game } = await makeGame();
    const mirror = equip(game, 1, 'huxinjing');
    await game.damage(0, 1, 1);
    expect(game.players[1].hp).toBe(2);
    await game.damage(0, 1, 1);
    expect(game.players[1].hp).toBe(1);
    expect(game.players[1].equips.armor).toBe(mirror);
    await game.damage(0, 1, 1);
    expect(game.players[1].hp).toBe(1);
    expect(game.players[1].equips.armor).toBeUndefined();
    expect(game.discardPile).toContain(mirror);
    await game.damage(0, 1, 1);
    expect(game.players[1].alive).toBe(false);
  });
});
