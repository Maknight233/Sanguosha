import { describe, expect, it } from 'vitest';
import { BasicAI } from '../src/ai/basic';
import { buildDeck } from '../src/data/cards';
import { Game, HOSTILE_WEIGHT } from '../src/engine/game';
import type { Card, PlayAction, Request, Suit } from '../src/engine/types';
import { give, makeGame, Scripted } from './helpers';

// 身份：0 主公 1 忠臣 2 反贼 3 反贼 4 内奸；0 与 1、4 距离 1，与 2、3 距离 2

/** 把一张指定花色、不是延时锦囊的牌放到牌堆顶，作为下一张判定牌 */
function stackTop(game: Game, suit: Suit): Card {
  const i = game.drawPile.findIndex((c) => c.suit === suit && c.key === 'bi');
  const [c] = game.drawPile.splice(i, 1);
  game.drawPile.push(c);
  return c;
}

/** seat 对 target 使用一张延时锦囊（走正常出牌流程） */
async function place(game: Game, seat: number, key: string, target: number) {
  const card = give(game, seat, key);
  game.takeFromHand(game.players[seat], card.id);
  await game.useCard(game.players[seat], card, target);
  return card;
}

/** 让 seat 进行一个完整回合，返回其收到的出牌请求 */
async function runTurn(game: Game, ctrls: Scripted[], seat: number) {
  game.current = seat;
  ctrls[seat].requests = [];
  await game.runTurn(seat);
  return ctrls[seat].requests.filter((r): r is Extract<Request, { type: 'play' }> => r.type === 'play');
}

describe('延时锦囊：使用', () => {
  it('【断粮】限距离 1，【军令】不限距离；同名不能重复放入', async () => {
    const { game } = await makeGame();
    const dl = give(game, 0, 'duanliang');
    const jl = give(game, 0, 'junling');
    const targets = (id: number) => game.legalPlays(0).find((o) => o.cardId === id)!.targets;
    expect(targets(dl.id)).toEqual([1, 4]);
    expect(targets(jl.id)).toEqual([1, 2, 3, 4]);
    await place(game, 0, 'junling', 2);
    expect(targets(jl.id)).toEqual([1, 3, 4]);
  });

  it('置于目标判定区并计入敌对，牌数守恒', async () => {
    const { game } = await makeGame();
    const total = game.totalCards();
    const card = await place(game, 0, 'duanliang', 1);
    expect(game.players[1].judge).toEqual([{ card, from: 0 }]);
    expect(game.hostility[0][1]).toBe(HOSTILE_WEIGHT.delay);
    expect(game.view(3).players[1].judge.map((j) => j.card.key)).toEqual(['duanliang']);
    expect(game.totalCards()).toBe(total);
    expect(game.discardPile).not.toContain(card);
  });
});

describe('延时锦囊：判定', () => {
  it('【断粮】判定不为 ♣ 时少摸 1 张，为 ♣ 时正常摸牌', async () => {
    const { game, ctrls } = await makeGame();
    await place(game, 0, 'duanliang', 1);
    stackTop(game, 'heart');
    await runTurn(game, ctrls, 1);
    expect(game.players[1].hand).toHaveLength(1);
    expect(game.players[1].judge).toHaveLength(0);

    game.players[1].hand.length = 0;
    await place(game, 0, 'duanliang', 1);
    stackTop(game, 'club');
    await runTurn(game, ctrls, 1);
    expect(game.players[1].hand.length).toBe(2);
    const ev = game.log.map((e) => e.event).filter((e) => e?.type === 'judge');
    expect(ev.map((e) => e!.type === 'judge' && e!.effective)).toEqual([true, false]);
  });

  it('【军令】判定为黑色时本回合不能使用【斩】（宝刀也不行），红色时可以', async () => {
    const { game, ctrls } = await makeGame(undefined, undefined, { generals: ['caocao', 'guojia', 'huangzhong', 'liubei', 'zhaoyun'], skills: true });
    give(game, 2, 'zhan');
    give(game, 2, 'qiji');
    await place(game, 0, 'junling', 2);
    stackTop(game, 'spade');
    const plays = await runTurn(game, ctrls, 2);
    const hasZhan = (r: Extract<Request, { type: 'play' }>) =>
      r.options.some((o) => game.discardPile.concat(game.players[2].hand).find((c) => c.id === o.cardId)?.key === 'zhan');
    expect(plays.length).toBeGreaterThan(0);
    expect(plays.some(hasZhan)).toBe(false);
    expect(plays.some((r) => r.skills.some((s) => s.skill === 'baodao'))).toBe(false);

    await place(game, 0, 'junling', 2);
    stackTop(game, 'diamond');
    const plays2 = await runTurn(game, ctrls, 2);
    expect(plays2.some(hasZhan)).toBe(true);
  });

  it('判定前可被【识破】抵消：直接弃置，不判定', async () => {
    const { game, ctrls } = await makeGame();
    const sp = give(game, 0, 'shipo');
    ctrls[0].handler = (_v, req) => (req.type === 'respond' && req.reason.kind === 'shipo' ? sp.id : undefined);
    const card = await place(game, 2, 'duanliang', 3);
    // 3 号的判定由 0 号（主公）识破：有害锦囊被挡记为帮助
    const top = stackTop(game, 'heart');
    await runTurn(game, ctrls, 3);
    expect(game.players[3].judge).toHaveLength(0);
    expect(game.discardPile).toContain(card);
    expect(game.players[3].hand).toContain(top); // 判定牌没被翻开，被正常摸到
    expect(game.players[3].hand).toHaveLength(2);
    expect(game.help[0][3]).toBeGreaterThan(0);
  });

  it('两张延时锦囊按放入顺序判定', async () => {
    const { game, ctrls } = await makeGame();
    await place(game, 4, 'junling', 0);
    await place(game, 1, 'duanliang', 0);
    stackTop(game, 'club'); // 第 2 张判定：♣ → 断粮不生效
    stackTop(game, 'heart'); // 第 1 张判定：红 → 军令不生效
    await runTurn(game, ctrls, 0);
    const judged = game.log.flatMap((e) => (e.event?.type === 'judge' ? [e.event.trick.key] : []));
    expect(judged).toEqual(['junling', 'duanliang']);
    expect(game.players[0].hand).toHaveLength(2);
  });

  it('角色阵亡时判定区的牌一并弃置', async () => {
    const { game } = await makeGame();
    const card = await place(game, 0, 'junling', 3);
    game.players[3].hp = 1;
    await game.damage(0, 3, 1);
    expect(game.players[3].alive).toBe(false);
    expect(game.players[3].judge).toHaveLength(0);
    expect(game.discardPile).toContain(card);
  });
});

describe('延时锦囊与【神算】', () => {
  const GENERALS = ['zhugeliang', 'guojia', 'zhangliao', 'liubei', 'zhaoyun'];

  it('诸葛亮使用的延时锦囊不能被【识破】，且触发每回合第一次使用锦囊摸牌', async () => {
    const sp = new Scripted();
    const ctrls = [new Scripted(), new Scripted(), sp, new Scripted(), new Scripted()];
    const { game } = await makeGame(ctrls, undefined, { generals: GENERALS, skills: true });
    const shipo = give(game, 2, 'shipo');
    sp.handler = (_v, req) => (req.type === 'respond' ? shipo.id : undefined);
    game.current = 0;
    await place(game, 0, 'junling', 2);
    expect(game.players[0].hand).toHaveLength(1); // 神算摸 1
    stackTop(game, 'spade');
    await game.judgePhase(game.players[2]);
    expect(game.players[2].hand).toContain(shipo); // 没有被问到/打出识破
    expect(game.junlingActive).toBe(true);
  });

  it('诸葛亮中了【断粮】：改为观看 3 张获得 1 张', async () => {
    const { game, ctrls } = await makeGame(undefined, undefined, { generals: GENERALS, skills: true });
    await place(game, 1, 'duanliang', 0);
    stackTop(game, 'heart');
    const total = game.totalCards();
    await runTurn(game, ctrls, 0);
    const sel = ctrls[0].requests.find((r) => r.type === 'selectCards');
    expect(sel && sel.type === 'selectCards' && sel.count).toBe(1);
    expect(game.totalCards()).toBe(total);
  });
});

describe('延时锦囊：AI', () => {
  it('AI 把【军令】用在敌人身上，并用【识破】保护队友', async () => {
    const { game } = await makeGame();
    const ai = new BasicAI();
    const jl = give(game, 2, 'junling');
    // 反贼 2 号：主公是敌人，优先针对主公
    const action = (await ai.decide(game.view(2), { type: 'play', options: game.legalPlays(2), skills: [] })) as PlayAction;
    expect(action).toEqual({ type: 'use', cardId: jl.id, target: 0 });

    const sp = give(game, 1, 'shipo');
    const req: Request = { type: 'respond', accept: ['shipo'], reason: { kind: 'shipo', trick: 'junling', user: 2, target: 0, countering: false } };
    expect(await ai.decide(game.view(1), req)).toBe(sp.id);
  });

  it('牌堆共 84 张，含【断粮】【军令】各 2 张', () => {
    const deck = buildDeck();
    expect(deck).toHaveLength(84);
    expect(deck.filter((c) => c.key === 'duanliang')).toHaveLength(2);
    expect(deck.filter((c) => c.key === 'junling')).toHaveLength(2);
  });
});
