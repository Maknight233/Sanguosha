import { describe, expect, it } from 'vitest';
import { BasicAI } from '../src/ai/basic';
import { Game } from '../src/engine/game';
import type { Request } from '../src/engine/types';
import { give, makeGame, ROLES, Scripted } from './helpers';

// 身份：0 主公 1 忠臣 2 反贼 3 反贼 4 内奸

const FILL = ['zhouyu', 'zhaoyun', 'lvbu', 'zhangliao', 'guojia'];
function gens(spec: Record<number, string>): string[] {
  const used = new Set(Object.values(spec));
  const filler = FILL.filter((g) => !used.has(g));
  return [0, 1, 2, 3, 4].map((s) => spec[s] ?? filler.shift()!);
}

async function setup(spec: Record<number, string>, handler?: (req: Request) => unknown) {
  const ctrls = ROLES.map(() => new Scripted(handler ? (_v, req) => handler(req) as never : undefined));
  return makeGame(ctrls, ROLES, { generals: gens(spec), skills: true });
}

const skillOpt = (game: Game, seat: number, skill: string) => game.legalSkills(seat).find((s) => s.skill === skill);

describe('蔡文姬【清音】', () => {
  it('其他角色濒死时弃一张手牌令其回复 1 点；每回合限一次', async () => {
    const { game } = await setup({ 1: 'caiwenji' }, (req) => (req.type === 'choose' && req.reason === 'qingyin' ? req.options[0].id : undefined));
    give(game, 1, 'zhan');
    give(game, 1, 'zhan');
    game.players[4].hp = 1;
    await game.damage(2, 4, 1);
    expect(game.players[4].hp).toBe(1);
    expect(game.players[1].hand).toHaveLength(2);
    expect(game.qingyinUsed.has(1)).toBe(true);
    // 本轮已用：不再询问
    game.players[3].hp = 1;
    await game.damage(2, 3, 1);
    expect(game.players[3].alive).toBe(false);
    expect(game.players[1].hand).toHaveLength(2);
  });

  it('不能对主公发动', async () => {
    const { game } = await setup({ 1: 'caiwenji' }, (req) => (req.type === 'choose' && req.reason === 'qingyin' ? req.options[0].id : undefined));
    give(game, 1, 'zhan');
    game.players[0].hp = 1;
    await expect(game.damage(2, 0, 1)).rejects.toThrow('game over');
    expect(game.players[1].hand).toHaveLength(1);
  });

  it('不能对自己发动', async () => {
    const { game } = await setup({ 1: 'caiwenji' }, (req) => (req.type === 'choose' && req.reason === 'qingyin' ? req.options[0].id : undefined));
    give(game, 1, 'zhan');
    game.players[1].hp = 1;
    await game.damage(2, 1, 1);
    expect(game.players[1].alive).toBe(false);
  });
});

describe('大乔【抚伤】', () => {
  it('交给已受伤的其他角色两张手牌，其回复 1 点，大乔摸一张；每回合限一次', async () => {
    const { game } = await setup({ 0: 'daqiao' });
    const a = give(game, 0, 'zhan');
    const b = give(game, 0, 'bi');
    give(game, 0, 'zhan');
    expect(skillOpt(game, 0, 'fushang')).toBeUndefined();
    game.players[1].hp -= 1;
    const opt = skillOpt(game, 0, 'fushang')!;
    expect(opt.targets).toEqual([1]);
    const hp = game.players[1].hp;
    await game.useSkill(game.players[0], opt, [a.id, b.id], [1]);
    expect(game.players[1].hp).toBe(hp + 1);
    expect(game.players[1].hand).toHaveLength(2);
    expect(game.players[0].hand).toHaveLength(2);
    game.players[1].hp -= 1;
    expect(skillOpt(game, 0, 'fushang')).toBeUndefined();
  });
});

describe('糜竺【济困】', () => {
  it('出牌阶段对已受伤的其他角色使用【药】，然后摸两张', async () => {
    const { game } = await setup({ 0: 'mizhu' });
    const total = game.totalCards();
    const yao = give(game, 0, 'yao');
    game.players[2].hp -= 1;
    const opt = skillOpt(game, 0, 'jikun')!;
    expect(opt.targets).toEqual([2]);
    await game.useSkill(game.players[0], opt, [yao.id], [2]);
    expect(game.players[2].hp).toBe(game.players[2].maxHp);
    expect(game.players[0].hand).toHaveLength(2);
    expect(game.totalCards()).toBe(total);
  });

  it('濒死时用【药】救其他角色摸两张，救主公不摸', async () => {
    const { game } = await setup({ 1: 'mizhu' });
    const yao = give(game, 1, 'yao');
    const yao2 = give(game, 1, 'yao');
    game.controllers[1] = new Scripted((_v, req) => (req.type === 'respond' && req.reason.kind === 'save' ? (game.players[1].hand.some((c) => c.id === yao.id) ? yao.id : yao2.id) : undefined) as never);
    game.players[4].hp = 1;
    await game.damage(2, 4, 1);
    expect(game.players[4].hp).toBe(1);
    expect(game.players[1].hand).toHaveLength(3);
    // 救主公不摸
    game.players[0].hp = 1;
    await game.damage(2, 0, 1);
    expect(game.players[0].hp).toBe(1);
    expect(game.players[1].hand).toHaveLength(2);
  });
});

describe('糜竺【济困】自用', () => {
  it('对自己使用【药】后摸一张', async () => {
    const { game } = await setup({ 0: 'mizhu' });
    const yao = give(game, 0, 'yao');
    game.players[0].hp -= 1;
    game.takeFromHand(game.players[0], yao.id);
    await game.useCard(game.players[0], yao);
    expect(game.players[0].hp).toBe(game.players[0].maxHp);
    expect(game.players[0].hand).toHaveLength(1);
  });
});

describe('庞德【抬榇】', () => {
  it('脱离濒死后摸三张；未脱离（阵亡）不摸', async () => {
    const { game } = await setup({ 1: 'caiwenji', 4: 'pangde' }, (req) => (req.type === 'choose' && req.reason === 'qingyin' ? req.options[0].id : undefined));
    give(game, 1, 'zhan');
    game.players[4].hp = 1;
    await game.damage(2, 4, 1);
    expect(game.players[4].hp).toBe(1);
    expect(game.players[4].hand).toHaveLength(3);
  });
});

describe('AI', () => {
  it('蔡文姬只救队友', async () => {
    // 1 号忠臣：主公是队友，打主公的 2 号是敌人
    const { game } = await setup({ 1: 'caiwenji' });
    const z = give(game, 1, 'zhan');
    const ai = new BasicAI();
    const opts = [{ id: String(z.id), label: '' }, { id: 'no', label: '' }];
    game.markHostile(2, 0);
    expect(await ai.decide(game.view(1), { type: 'choose', reason: 'qingyin', target: 2, options: opts })).toBe('no');
    expect(await ai.decide(game.view(1), { type: 'choose', reason: 'qingyin', target: 0, options: opts })).toBe(String(z.id));
  });

  it('有新武将的 AI 对局都能正常结束，牌数守恒', async () => {
    for (let seed = 1; seed <= 10; seed++) {
      const game = new Game({
        controllers: ROLES.map(() => new BasicAI()),
        seed,
        generals: ['mizhu', 'daqiao', 'caiwenji', 'pangde', 'caocao'],
        roles: ROLES,
        maxTurns: 500,
      });
      await game.start();
    }
  });
});
