import { describe, expect, it } from 'vitest';
import { BasicAI } from '../src/ai/basic';
import type { Game } from '../src/engine/game';
import type { Card, Request, Suit } from '../src/engine/types';
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

/** 把一张指定花色的【避】放到牌堆顶，作为下一张判定牌 */
function stackTop(game: Game, suit: Suit): Card {
  const i = game.drawPile.findIndex((c) => c.suit === suit && c.key === 'bi');
  const [c] = game.drawPile.splice(i, 1);
  game.drawPile.push(c);
  return c;
}

/** 从牌堆中取一张指定花色、指定牌名的牌给某角色 */
function giveSuit(game: Game, seat: number, key: string, suit: Suit): Card {
  const i = game.drawPile.findIndex((c) => c.key === key && c.suit === suit);
  const [c] = game.drawPile.splice(i, 1);
  game.players[seat].hand.push(c);
  return c;
}

async function placeJunling(game: Game, from: number, target: number) {
  const card = give(game, from, 'junling');
  game.takeFromHand(game.players[from], card.id);
  await game.useCard(game.players[from], card, target);
}

const judgeEvents = (game: Game) => game.log.flatMap((e) => (e.event?.type === 'judge' ? [e.event] : []));

describe('荀彧【定策】', () => {
  it('打出一张手牌代替判定牌并摸一张，原判定牌进弃牌堆；不限次数', async () => {
    const { game, ctrls } = await setup(gens({ 1: 'xunyu' }));
    const red = giveSuit(game, 1, 'zhan', 'heart');
    ctrls[1].handler = (_v, req) => (req.type === 'choose' && req.reason === 'dingce' ? String(red.id) : undefined);
    await placeJunling(game, 0, 2);
    const original = stackTop(game, 'spade'); // 黑色：军令本应生效
    game.current = 2;
    const total = game.totalCards();
    await game.judgePhase(game.players[2]);
    expect(game.junlingActive).toBe(false);
    expect(judgeEvents(game).at(-1)!.result).toEqual(red);
    expect(game.discardPile).toContain(original);
    expect(game.discardPile).toContain(red);
    expect(game.players[1].hand).not.toContain(red);
    expect(game.players[1].hand).toHaveLength(1); // 定策后摸一张
    expect(game.totalCards()).toBe(total);

    // 同一回合再判定：仍会询问
    ctrls[1].requests = [];
    ctrls[1].handler = () => undefined; // 默认选第一项（打出第一张手牌）
    await placeJunling(game, 0, 2);
    stackTop(game, 'spade');
    await game.judgePhase(game.players[2]);
    expect(ctrls[1].requests.some((r) => r.type === 'choose' && r.reason === 'dingce')).toBe(true);
  });

  it('AI：敌人中延时锦囊且判定对敌人有利时，用最便宜的牌改判', async () => {
    const { game } = await setup(gens({ 1: 'xunyu' }));
    const ai = new BasicAI();
    const bi = giveSuit(game, 1, 'bi', 'spade');
    const zhan = giveSuit(game, 1, 'zhan', 'club');
    const redCard = game.drawPile.find((c) => c.key === 'bi' && c.suit === 'heart')!;
    const ask = (seat: number, what: string, result: Card): Request => ({
      type: 'choose',
      reason: 'dingce',
      judge: { seat, what, result },
      options: [{ id: String(bi.id), label: '' }, { id: String(zhan.id), label: '' }, { id: 'no', label: '' }],
    });
    // 主公（队友）中【军令】判定为红（未生效）：对队友有利，不改
    expect(await ai.decide(game.view(1), ask(0, 'junling', redCard))).toBe('no');
    // 敌人（反贼 2 号已打过主公）中【军令】判定为红：改成黑色，选更便宜的【斩】
    game.markHostile(2, 0);
    game.markHostile(2, 0);
    expect(await ai.decide(game.view(1), ask(2, 'junling', redCard))).toBe(String(zhan.id));
  });
});

describe('魏延【奇袭】', () => {
  it('黑色：视为对距离 1 的一名角色使用【斩】（可被【避】抵消）；出牌阶段限一次', async () => {
    const { game, ctrls } = await setup(gens({ 0: 'weiyan' }));
    ctrls[0].handler = (_v, req) => (req.type === 'choose' && req.reason === 'qixi' ? '1' : undefined);
    game.current = 0;
    const opt = game.legalSkills(0).find((s) => s.skill === 'qixi')!;
    stackTop(game, 'club');
    await game.useSkill(game.players[0], opt, [], []);
    expect(game.players[1].hp).toBe(game.players[1].maxHp - 1);
    expect(game.hostility[0][1]).toBeGreaterThan(0);
    const req = ctrls[0].requests.find((r) => r.type === 'choose' && r.reason === 'qixi');
    // 只能选距离 1 的 1、4 号（即使有远程武器）
    expect(req && req.type === 'choose' && req.options.map((o) => o.id)).toEqual(['1', '4', 'no']);
    expect(game.legalSkills(0).some((s) => s.skill === 'qixi')).toBe(false);
    expect(game.zhanUsed).toBe(0);
  });

  it('黑色时目标可以打出【避】', async () => {
    const { game, ctrls } = await setup(gens({ 0: 'weiyan' }));
    ctrls[0].handler = (_v, req) => (req.type === 'choose' && req.reason === 'qixi' ? '4' : undefined);
    const bi = give(game, 4, 'bi');
    ctrls[4].handler = (_v, req) => (req.type === 'respond' ? bi.id : undefined);
    game.current = 0;
    stackTop(game, 'spade');
    await game.useSkill(game.players[0], game.legalSkills(0).find((s) => s.skill === 'qixi')!, [], []);
    expect(game.players[4].hp).toBe(game.players[4].maxHp);
    expect(game.discardPile).toContain(bi);
  });

  it('红色：无效果', async () => {
    const { game } = await setup(gens({ 0: 'weiyan' }));
    game.current = 0;
    const opt = game.legalSkills(0).find((s) => s.skill === 'qixi')!;
    stackTop(game, 'heart');
    await game.useSkill(game.players[0], opt, [], []);
    expect(game.players[0].hand).toHaveLength(0);
    expect(judgeEvents(game).at(-1)).toMatchObject({ what: 'qixi', effective: false });
  });
});

describe('吕蒙【渡江】', () => {
  it('♦ 手牌当【断粮】（限一次、摸一张），不受距离限制，按【断粮】判定，弃置时是原牌', async () => {
    const { game, ctrls } = await setup(gens({ 0: 'lvmeng' }));
    giveSuit(game, 0, 'zhan', 'spade');
    expect(game.legalSkills(0).some((s) => s.skill === 'dujiang')).toBe(false); // 没有 ♦ 牌
    const d = giveSuit(game, 0, 'zhan', 'diamond');
    const opt = game.legalSkills(0).find((s) => s.skill === 'dujiang')!;
    expect(opt.targets).toEqual([1, 2, 3, 4]); // 包括距离 2 的 2、3 号
    game.current = 0;
    await game.useSkill(game.players[0], opt, [d.id], [2]);
    expect(game.players[2].judge).toEqual([{ card: d, from: 0, as: 'duanliang' }]);
    expect(game.players[0].hand).toHaveLength(2); // 黑桃【斩】+ 摸的一张
    giveSuit(game, 0, 'bi', 'diamond');
    expect(game.legalSkills(0).some((s) => s.skill === 'dujiang')).toBe(false); // 出牌阶段限一次
    // 同名限制：2 号身上已有【断粮】
    game.skillUsed.clear();
    expect(game.legalSkills(0).find((s) => s.skill === 'dujiang')!.targets).toEqual([1, 3, 4]);
    // 真【断粮】也不能再放给 2 号
    const dl = give(game, 0, 'duanliang');
    game.players[2].equips = {};
    expect(game.legalPlays(0).find((o) => o.cardId === dl.id)?.targets ?? []).not.toContain(2);

    stackTop(game, 'heart');
    game.current = 2;
    ctrls[2].requests = [];
    await game.runTurn(2);
    expect(judgeEvents(game).at(-1)).toMatchObject({ what: 'duanliang', effective: true });
    expect(game.players[2].hand).toHaveLength(1); // 少摸 1 张
    expect(game.discardPile).toContain(d);
  });
});

describe('于吉【卜筮】', () => {
  it('获得其他角色的判定牌（每回合限一次），自己的判定不行', async () => {
    const { game, ctrls } = await setup(gens({ 4: 'yuji', 0: 'weiyan' }));
    ctrls[4].handler = (_v, req) => (req.type === 'choose' && req.reason === 'bushi' ? 'yes' : undefined);
    await placeJunling(game, 1, 0);
    await placeJunling(game, 1, 4);
    const top = stackTop(game, 'heart');
    game.current = 0;
    const total = game.totalCards();
    await game.judgePhase(game.players[0]);
    expect(game.players[4].hand).toContain(top);
    expect(game.totalCards()).toBe(total);
    // 同一回合第二次判定（奇袭）：不再获得
    const opt = game.legalSkills(0).find((s) => s.skill === 'qixi')!;
    const top2 = stackTop(game, 'heart');
    await game.useSkill(game.players[0], opt, [], []);
    expect(game.players[4].hand).not.toContain(top2);
    expect(game.discardPile).toContain(top2);
    // 于吉自己的判定：不询问
    ctrls[4].requests = [];
    game.turn++;
    game.current = 4;
    stackTop(game, 'heart');
    await game.judgePhase(game.players[4]);
    expect(ctrls[4].requests.some((r) => r.type === 'choose' && r.reason === 'bushi')).toBe(false);
  });

  it('荀彧改判后，于吉获得的是改判后的牌', async () => {
    const { game, ctrls } = await setup(gens({ 1: 'xunyu', 4: 'yuji' }));
    const sub = giveSuit(game, 1, 'zhan', 'spade');
    ctrls[1].handler = (_v, req) => (req.type === 'choose' && req.reason === 'dingce' ? String(sub.id) : undefined);
    ctrls[4].handler = (_v, req) => (req.type === 'choose' && req.reason === 'bushi' ? 'yes' : undefined);
    await placeJunling(game, 0, 2);
    const original = stackTop(game, 'heart');
    game.current = 2;
    await game.judgePhase(game.players[2]);
    expect(game.players[4].hand).toContain(sub);
    expect(game.discardPile).toContain(original);
    expect(game.junlingActive).toBe(true);
  });
});
