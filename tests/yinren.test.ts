import { describe, expect, it } from 'vitest';
import { BasicAI } from '../src/ai/basic';
import { Game } from '../src/engine/game';
import type { PlayAction, Role } from '../src/engine/types';
import { give, makeGame, Scripted } from './helpers';

const R7: Role[] = ['lord', 'loyalist', 'loyalist', 'rebel', 'rebel', 'rebel', 'renegade'];
const R8: Role[] = ['lord', 'loyalist', 'loyalist', 'rebel', 'rebel', 'rebel', 'renegade', 'renegade'];
const G8 = ['caocao', 'guojia', 'zhangliao', 'liubei', 'zhaoyun', 'sunquan', 'zhouyu', 'lvbu'];

async function setup(roles: Role[], answer: 'yes' | 'no' = 'yes') {
  const ctrls = roles.map(() => new Scripted((_v, req) => (req.type === 'choose' && req.reason === 'yinren' ? answer : undefined)));
  return makeGame(ctrls, roles, { generals: G8.slice(0, roles.length) });
}

describe('内奸【隐忍】', () => {
  it('7 人局：濒死时发动，亮出身份、回复至 1 点，免伤直到自己回合开始', async () => {
    const { game } = await setup(R7);
    const rg = game.players[6];
    rg.hp = 1;
    await game.damage(3, 6, 2);
    expect(rg.alive).toBe(true);
    expect(rg.hp).toBe(1);
    expect(game.view(0).players[6].role).toBe('renegade');
    expect(game.view(0).players[6].shielded).toBe(true);
    expect(await game.damage(0, 6, 3)).toBe(0);
    expect(rg.hp).toBe(1);

    game.current = 6;
    await game.runTurn(6);
    expect(game.view(0).players[6].shielded).toBe(false);
    // 只能发动一次
    await game.damage(0, 6, 1);
    expect(rg.alive).toBe(false);
  });

  it('不发动则之后不能再发动；牌数守恒', async () => {
    const { game } = await setup(R7, 'no');
    const total = game.totalCards();
    const rg = game.players[6];
    rg.hp = 1;
    expect(game.view(6).players[6].yinren).toBe(true);
    expect(game.view(0).players[6].yinren).toBeFalsy();
    await game.damage(3, 6, 1);
    expect(rg.alive).toBe(false);
    expect(game.totalCards()).toBe(total);
  });

  it('5、6 人局没有【隐忍】', async () => {
    const { game } = await setup(['lord', 'loyalist', 'rebel', 'rebel', 'renegade']);
    game.players[4].hp = 1;
    await game.damage(2, 4, 1);
    expect(game.players[4].alive).toBe(false);
  });

  it('8 人局：另一名内奸存活时没有，阵亡后才获得', async () => {
    const { game } = await setup(R8);
    expect(game.hasYinren(6)).toBe(false);
    expect(game.hasYinren(7)).toBe(false);
    game.players[7].hp = 1;
    await game.damage(3, 7, 1);
    expect(game.players[7].alive).toBe(false);
    expect(game.hasYinren(6)).toBe(true);
    game.players[6].hp = 1;
    await game.damage(3, 6, 1);
    expect(game.players[6].alive).toBe(true);
    expect(game.players[6].hp).toBe(1);
  });

  it('主动·摸牌：摸本局受到的伤害数（至多 4），亮身份，之后不能保命', async () => {
    const { game } = await setup(R7);
    expect(game.legalSkills(6).map((o) => o.skill)).toEqual(['yinrenHit']);
    await game.damage(3, 6, 1);
    await game.damage(3, 6, 1);
    const opt = game.legalSkills(6).find((o) => o.skill === 'yinrenDraw')!;
    const before = game.players[6].hand.length;
    await game.useSkill(game.players[6], opt, [], []);
    expect(game.players[6].hand.length).toBe(before + 2);
    expect(game.view(0).players[6].role).toBe('renegade');
    expect(game.legalSkills(6)).toEqual([]);
    game.players[6].hp = 1;
    await game.damage(3, 6, 1);
    expect(game.players[6].alive).toBe(false);
  });

  it('主动·摸牌：上限 4 张', async () => {
    const { game } = await setup(R7);
    game.damageTaken[6] = 6;
    const before = game.players[6].hand.length;
    await game.useSkill(game.players[6], game.legalSkills(6).find((o) => o.skill === 'yinrenDraw')!, [], []);
    expect(game.players[6].hand.length).toBe(before + 4);
  });

  it('摸牌后的强化：之后使用的 X 张牌伤害 / 回复 +1，无伤害的牌也消耗次数', async () => {
    const plays: (() => PlayAction)[] = [];
    const ctrls = R7.map(() => new Scripted());
    ctrls[6] = new Scripted((_v, req) => (req.type === 'play' ? (plays.shift()?.() ?? ({ type: 'end' } as PlayAction)) : undefined));
    const { game } = await makeGame(ctrls, R7, { generals: G8.slice(0, 7) });
    const rg = game.players[6];
    rg.hp = 1;
    game.empower[6] = 3;
    const eq = give(game, 6, 'huxinjing');
    const zhan = give(game, 6, 'zhan');
    const yao = give(game, 6, 'yao');
    plays.push(
      () => ({ type: 'use', cardId: eq.id }),
      () => ({ type: 'use', cardId: zhan.id, target: 0 }),
      () => ({ type: 'use', cardId: yao.id }),
    );
    const lordHp = game.players[0].hp;
    game.current = 6;
    await game.playPhase(rg);
    expect(game.players[0].hp).toBe(lordHp - 2);
    expect(rg.hp).toBe(3);
    expect(game.empower[6]).toBe(0);
    expect(game.view(0).players[6].empower).toBe(0);
  });

  it('强化对打出的牌同样生效：用【药】救人回复 2 点', async () => {
    const ctrls = R7.map(() => new Scripted());
    let yaoId = -1;
    ctrls[6] = new Scripted((_v, req) => (req.type === 'respond' && req.reason.kind === 'save' ? yaoId : undefined));
    const { game } = await makeGame(ctrls, R7, { generals: G8.slice(0, 7) });
    game.empower[6] = 1;
    yaoId = give(game, 6, 'yao').id;
    game.players[1].hp = 1;
    await game.damage(3, 1, 1);
    expect(game.players[1].hp).toBe(2);
    expect(game.empower[6]).toBe(0);
  });

  it('主动·重创：2 点伤害，目标本回合不能使用或打出牌（濒死不能自救），下回合恢复', async () => {
    const { game } = await setup(R7);
    const t = game.players[1];
    t.hp = 2;
    give(game, 1, 'yao');
    give(game, 1, 'bi');
    const opt = game.legalSkills(6).find((o) => o.skill === 'yinrenHit')!;
    await game.useSkill(game.players[6], opt, [], [1]);
    expect(t.alive).toBe(false);

    const g2 = (await setup(R7)).game;
    g2.players[1].hp = 4;
    give(g2, 1, 'bi');
    await g2.useSkill(g2.players[6], g2.legalSkills(6).find((o) => o.skill === 'yinrenHit')!, [], [1]);
    expect(g2.players[1].hp).toBe(2);
    expect(await g2.askForCard(1, ['bi'], { kind: 'dodge', source: 6 })).toBeNull();
    g2.current = 0;
    await g2.runTurn(0);
    expect(g2.locked.size).toBe(0);
  });

  it('AI 会发动；7 人 AI 对局能正常结束', async () => {
    for (let seed = 1; seed <= 30; seed++) {
      const game = new Game({ controllers: R7.map(() => new BasicAI()), seed, maxTurns: 500 });
      await game.start();
    }
    const ai = new BasicAI();
    const { game } = await setup(R7);
    expect(await ai.decide(game.view(6), { type: 'choose', reason: 'yinren', options: [{ id: 'yes', label: '' }, { id: 'no', label: '' }] })).toBe('yes');
  });
});
