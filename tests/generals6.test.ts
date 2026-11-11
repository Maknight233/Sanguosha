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

describe('夏侯惇【拔矢】', () => {
  it('受到其他角色的伤害后弃一张手牌，对来源造成 1 点伤害；每回合限一次', async () => {
    const { game } = await setup({ 1: 'xiahoudun' }, (req) => (req.type === 'choose' && req.reason === 'bashi' ? req.options[0].id : undefined));
    give(game, 1, 'zhan');
    give(game, 1, 'zhan');
    game.turn = 3;
    const hp2 = game.players[2].hp;
    await game.damage(2, 1, 1);
    expect(game.players[2].hp).toBe(hp2 - 1);
    expect(game.players[1].hand).toHaveLength(1);
    await game.damage(2, 1, 1);
    expect(game.players[2].hp).toBe(hp2 - 1);
    expect(game.players[1].hand).toHaveLength(1);
  });

  it('无来源伤害、没有手牌或选择不发动时不反击', async () => {
    const { game } = await setup({ 1: 'xiahoudun' }, (req) => (req.type === 'choose' && req.reason === 'bashi' ? 'no' : undefined));
    give(game, 1, 'zhan');
    await game.damage(null, 1, 1);
    const hp2 = game.players[2].hp;
    await game.damage(2, 1, 1);
    expect(game.players[2].hp).toBe(hp2);
    expect(game.players[1].hand).toHaveLength(1);
  });
});

describe('马超【怒袭】', () => {
  it('受伤后获得「怒」（至多 1 枚），下一张【斩】伤害 +1 并弃置「怒」', async () => {
    const { game } = await setup({ 0: 'machao' });
    await game.damage(2, 0, 1);
    await game.damage(2, 0, 1);
    expect(game.nu.has(0)).toBe(true);
    const z = give(game, 0, 'zhan');
    game.takeFromHand(game.players[0], z.id);
    const hp = game.players[1].hp;
    await game.useCard(game.players[0], z, 1);
    expect(game.players[1].hp).toBe(hp - 2);
    expect(game.nu.has(0)).toBe(false);
    const z2 = give(game, 0, 'zhan');
    game.takeFromHand(game.players[0], z2.id);
    await game.useCard(game.players[0], z2, 1);
    expect(game.players[1].hp).toBe(hp - 3);
  });

  it('被【避】抵消也会消耗「怒」', async () => {
    const { game } = await setup({ 0: 'machao' });
    game.nu.add(0);
    const bi = give(game, 1, 'bi');
    game.controllers[1] = new Scripted((_v, req) => (req.type === 'respond' ? bi.id : undefined));
    const z = give(game, 0, 'zhan');
    game.takeFromHand(game.players[0], z.id);
    const hp = game.players[1].hp;
    await game.useCard(game.players[0], z, 1);
    expect(game.players[1].hp).toBe(hp);
    expect(game.nu.has(0)).toBe(false);
  });
});

describe('周泰【坚韧】', () => {
  it('受伤后体力 ≤ 2 时摸两张，否则不摸', async () => {
    const { game } = await setup({ 1: 'zhoutai' });
    await game.damage(2, 1, 1);
    expect(game.players[1].hand).toHaveLength(0);
    await game.damage(2, 1, 1);
    expect(game.players[1].hp).toBe(2);
    expect(game.players[1].hand).toHaveLength(2);
  });
});

describe('华雄【恃勇】', () => {
  it('伤害来源手牌比你多时，随机获得其一张手牌；牌数守恒', async () => {
    const { game } = await setup({ 1: 'huaxiong' });
    const total = game.totalCards();
    give(game, 2, 'zhan');
    give(game, 2, 'bi');
    await game.damage(2, 1, 1);
    expect(game.players[1].hand).toHaveLength(1);
    expect(game.players[2].hand).toHaveLength(1);
    // 一样多时不触发
    await game.damage(2, 1, 1);
    expect(game.players[1].hand).toHaveLength(1);
    expect(game.totalCards()).toBe(total);
  });
});

describe('AI', () => {
  it('夏侯惇只对敌人发动【拔矢】，且不弃【药】', async () => {
    const { game } = await setup({ 0: 'xiahoudun' });
    const yao = give(game, 0, 'yao');
    const ai = new BasicAI();
    game.markHostile(2, 0);
    const opts = [{ id: String(yao.id), label: '' }, { id: 'no', label: '' }];
    expect(await ai.decide(game.view(0), { type: 'choose', reason: 'bashi', target: 2, options: opts })).toBe('no');
    const z = give(game, 0, 'zhan');
    const opts2 = [{ id: String(yao.id), label: '' }, { id: String(z.id), label: '' }, { id: 'no', label: '' }];
    expect(await ai.decide(game.view(0), { type: 'choose', reason: 'bashi', target: 2, options: opts2 })).toBe(String(z.id));
  });

  it('有新武将的 AI 对局都能正常结束', async () => {
    for (let seed = 1; seed <= 10; seed++) {
      const game = new Game({
        controllers: ROLES.map(() => new BasicAI()),
        seed,
        generals: ['xiahoudun', 'machao', 'zhoutai', 'huaxiong', 'caocao'],
        roles: ROLES,
        maxTurns: 500,
      });
      await game.start();
    }
  });
});
