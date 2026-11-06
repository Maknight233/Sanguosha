import { describe, expect, it } from 'vitest';
import { BasicAI } from '../src/ai/basic';
import { buildDeck, DECK_SPEC, tianleiHit } from '../src/data/cards';
import { Game } from '../src/engine/game';
import type { Card, PlayAction } from '../src/engine/types';
import { equip, give, makeGame, Scripted } from './helpers';

// 身份：0 主公 1 忠臣 2 反贼 3 反贼 4 内奸；0 与 1、4 距离 1，与 2、3 距离 2

/** 把一张满足条件的非延时锦囊牌放到牌堆顶，作为下一张判定牌 */
function stackTop(game: Game, pred: (c: Card) => boolean): Card {
  const i = game.drawPile.findIndex((c) => pred(c) && c.key !== 'tianlei' && c.key !== 'duanliang' && c.key !== 'junling');
  const [c] = game.drawPile.splice(i, 1);
  game.drawPile.push(c);
  return c;
}
const HIT = (c: Card) => tianleiHit(c);
const MISS = (c: Card) => c.suit === 'heart';

/** seat 使用【天雷】（走正常出牌流程） */
async function placeTianlei(game: Game, seat: number): Promise<Card> {
  const card = give(game, seat, 'tianlei');
  game.takeFromHand(game.players[seat], card.id);
  await game.useCard(game.players[seat], card);
  return card;
}

async function runTurn(game: Game, seat: number) {
  game.current = seat;
  await game.runTurn(seat);
}

const leiOwners = (game: Game) => game.players.filter((p) => p.judge.some((j) => j.card.key === 'tianlei')).map((p) => p.seat);

describe('牌堆', () => {
  it('共 89 张：天雷 2、锁子甲、兽面盾、流星锤各 1；♠2–9 的比例基本不变', () => {
    const deck = buildDeck();
    expect(deck).toHaveLength(89);
    const n = (k: string) => deck.filter((c) => c.key === k).length;
    expect([n('tianlei'), n('suozijia'), n('shoumiandun'), n('liuxingchui')]).toEqual([2, 1, 1, 1]);
    expect(DECK_SPEC.reduce((s, d) => s + d.count, 0)).toBe(89);
    const ratio = deck.filter(tianleiHit).length / deck.length;
    expect(ratio).toBeGreaterThan(0.14);
    expect(ratio).toBeLessThan(0.17);
  });
});

describe('【天雷】', () => {
  it('只能对自己使用、判定区已有时不能再用；不计入敌对', async () => {
    const { game } = await makeGame();
    const a = give(game, 1, 'tianlei');
    const b = give(game, 1, 'tianlei');
    expect(game.legalPlays(1).find((o) => o.cardId === a.id)!.targets).toEqual([]);
    game.takeFromHand(game.players[1], a.id);
    await game.useCard(game.players[1], a);
    expect(game.players[1].judge).toEqual([{ card: a, from: 1 }]);
    expect(game.legalPlays(1).some((o) => o.cardId === b.id)).toBe(false);
    expect(game.hostility[1].every((x) => x === 0)).toBe(true);
  });

  it('判定 ♠2–9：受到 3 点无来源伤害，天雷弃置', async () => {
    const { game } = await makeGame();
    const card = await placeTianlei(game, 1);
    game.players[1].hp = 4;
    stackTop(game, HIT);
    await runTurn(game, 1);
    expect(game.players[1].hp).toBe(1);
    expect(leiOwners(game)).toEqual([]);
    expect(game.discardPile).toContain(card);
    const dmg = game.log.map((e) => e.event).find((e) => e?.type === 'damage');
    expect(dmg).toMatchObject({ seat: 1, amount: 3, from: null });
  });

  it('没劈中：移至下家；跳过判定区已有天雷的角色', async () => {
    const { game } = await makeGame();
    await placeTianlei(game, 1);
    await placeTianlei(game, 2);
    stackTop(game, MISS);
    await runTurn(game, 1);
    expect(leiOwners(game)).toEqual([2, 3]); // 1 号的天雷跳过 2 号，到了 3 号
    expect(game.players[1].hp).toBe(game.players[1].maxHp);
    expect(game.log.some((e) => e.text.includes('移至'))).toBe(true);
  });

  it('被【识破】抵消：不判定，同样移至下家', async () => {
    const { game, ctrls } = await makeGame();
    const sp = give(game, 0, 'shipo');
    ctrls[0].handler = (_v, req) => (req.type === 'respond' && req.reason.kind === 'shipo' ? sp.id : undefined);
    await placeTianlei(game, 1);
    stackTop(game, HIT);
    await runTurn(game, 1);
    expect(leiOwners(game)).toEqual([2]);
    expect(game.players[1].hp).toBe(game.players[1].maxHp);
    expect(game.log.some((e) => e.event?.type === 'judge')).toBe(false);
  });

  it('无处可传时留在原处，回合正常进行（不会死循环）', async () => {
    const { game } = await makeGame();
    for (const s of [2, 3, 4]) game.players[s].alive = false;
    await placeTianlei(game, 0);
    await placeTianlei(game, 1);
    stackTop(game, MISS);
    await runTurn(game, 1);
    expect(leiOwners(game)).toEqual([0, 1]);
  });

  it('劈死反贼：没有击杀奖励', async () => {
    const { game } = await makeGame();
    await placeTianlei(game, 2);
    game.players[2].hp = 3;
    stackTop(game, HIT);
    const hands = game.players.map((p) => p.hand.length);
    await runTurn(game, 2).catch(() => {});
    expect(game.players[2].alive).toBe(false);
    for (const s of [0, 1, 3, 4]) expect(game.players[s].hand.length).toBe(hands[s]);
  });

  it('牌数守恒、任何时刻每张牌只在一处', async () => {
    const { game } = await makeGame();
    const total = game.totalCards();
    game.subscribe(() => {
      const ids = [...game.drawPile, ...game.discardPile].map((c) => c.id);
      if (game.pendingJudge) ids.push(game.pendingJudge.id);
      for (const p of game.players) ids.push(...p.hand.map((c) => c.id), ...Object.values(p.equips).map((c) => c!.id), ...p.judge.map((j) => j.card.id));
      expect(new Set(ids).size).toBe(total);
      expect(ids).toHaveLength(total);
    });
    await placeTianlei(game, 1);
    stackTop(game, MISS);
    await runTurn(game, 1);
    stackTop(game, HIT);
    await runTurn(game, 2);
  });
});

describe('防具与武器', () => {
  it('【锁子甲】：距离 ≥2 的【斩】伤害 -1（即无伤害），距离 1 正常', async () => {
    const { game } = await makeGame();
    const armor = equip(game, 2, 'suozijia');
    await game.resolveZhan(0, 2); // 距离 2
    expect(game.players[2].hp).toBe(game.players[2].maxHp);
    expect(game.log.some((e) => e.text.includes('锁子甲'))).toBe(true);
    delete game.players[2].equips.armor;
    game.players[1].equips.armor = armor;
    await game.resolveZhan(0, 1); // 距离 1
    expect(game.players[1].hp).toBe(game.players[1].maxHp - 1);
  });

  it('【兽面盾】：成为【劫营】目标时判定，红色无效，黑色照常', async () => {
    const { game } = await makeGame();
    equip(game, 2, 'shoumiandun');
    const kept = give(game, 2, 'bi');
    const use = async () => {
      const c = give(game, 0, 'jieying');
      game.takeFromHand(game.players[0], c.id);
      await game.useCard(game.players[0], c, 2);
    };
    stackTop(game, (c) => c.suit === 'diamond');
    await use();
    expect(game.players[2].hand).toContain(kept);
    stackTop(game, (c) => c.suit === 'club');
    await use();
    // 默认控制器选手牌 → 被弃置
    expect(game.players[2].hand).not.toContain(kept);
    const ev = game.log.map((e) => e.event).filter((e) => e?.type === 'judge');
    expect(ev.map((e) => e!.type === 'judge' && e!.effective)).toEqual([true, false]);
  });

  it('【流星锤】：【斩】被【避】抵消后，弃一张手牌令目标弃一张牌', async () => {
    const ctrls = [0, 1, 2, 3, 4].map(() => new Scripted());
    const { game } = await makeGame(ctrls);
    equip(game, 0, 'liuxingchui');
    const pay = give(game, 0, 'yao');
    const bi = give(game, 2, 'bi');
    const lost = give(game, 2, 'tiaobing');
    ctrls[2].handler = (_v, req) => (req.type === 'respond' && req.reason.kind === 'dodge' ? bi.id : undefined);
    await game.resolveZhan(0, 2);
    expect(game.players[2].hp).toBe(game.players[2].maxHp);
    expect(game.players[0].hand).not.toContain(pay);
    expect(game.players[2].hand).not.toContain(lost);
    expect(game.discardPile).toEqual(expect.arrayContaining([pay, lost, bi]));
    expect(ctrls[0].requests.some((r) => r.type === 'choose' && r.reason === 'liuxing')).toBe(true);
  });
});

describe('AI', () => {
  const ai = new BasicAI();
  const play = (game: Game, seat: number) =>
    ai.decide(game.view(seat), { type: 'play', options: game.legalPlays(seat), skills: [] }) as Promise<PlayAction>;

  it('【天雷】：体力扛不住 3 点时不放；反贼体力落后时放', async () => {
    const { game } = await makeGame();
    const t = give(game, 2, 'tianlei');
    game.players[2].hp = 3;
    expect(await play(game, 2)).toEqual({ type: 'end' });
    game.players[2].hp = 4;
    expect(await play(game, 2)).toEqual({ type: 'use', cardId: t.id });
  });

  it('【识破】只为会被劈进濒死的自己 / 队友挡天雷', async () => {
    const { game } = await makeGame();
    const sp = give(game, 1, 'shipo');
    const req = (target: number) => ({ type: 'respond' as const, accept: ['shipo'], reason: { kind: 'shipo' as const, trick: 'tianlei', user: target, target, countering: false } });
    game.players[0].hp = 5;
    expect(await ai.decide(game.view(1), req(0))).toBeNull();
    game.players[0].hp = 3;
    expect(await ai.decide(game.view(1), req(0))).toBe(sp.id);
    game.players[2].hp = 1;
    expect(await ai.decide(game.view(1), req(2))).toBeNull(); // 敌人不挡
  });
});
