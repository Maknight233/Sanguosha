import { describe, expect, it } from 'vitest';
import { BasicAI } from '../src/ai/basic';
import { Game } from '../src/engine/game';
import type { Card, Request } from '../src/engine/types';
import { describeRequest } from '../src/ui/describe';
import { equip, give, makeGame, ROLES, Scripted } from './helpers';

// 身份：0 主公 1 忠臣 2 反贼 3 反贼 4 内奸；默认当前回合为座位 0

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

/** 交给某玩家一张指定点数的牌（优先非【药】，避免影响濒死） */
function giveRank(game: Game, seat: number, rank: number): Card {
  for (const pile of [game.drawPile, game.discardPile]) {
    const i = pile.findIndex((c) => c.rank === rank && c.key !== 'yao' && c.key !== 'bi');
    if (i >= 0) {
      const card = pile.splice(i, 1)[0];
      game.players[seat].hand.push(card);
      return card;
    }
  }
  throw new Error(`牌堆中没有点数 ${rank} 的牌`);
}

describe('拼点通用规则', () => {
  it('双方各出一张手牌进弃牌堆；平局算发起者输', async () => {
    const { game } = await setup({});
    const a = giveRank(game, 0, 7);
    const b = giveRank(game, 2, 7);
    expect(await game.pindian(0, 2, 'bohu')).toBe(false);
    expect(game.players[0].hand).toHaveLength(0);
    expect(game.players[2].hand).toHaveLength(0);
    expect(game.discardPile.slice(-2)).toEqual([a, b]);
    giveRank(game, 0, 8);
    giveRank(game, 2, 7);
    expect(await game.pindian(0, 2, 'bohu')).toBe(true);
    const ev = game.log.at(-1)!.event!;
    expect(ev.type).toBe('pindian');
  });

  it('任一方没有手牌时不进行', async () => {
    const { game } = await setup({});
    giveRank(game, 0, 13);
    expect(await game.pindianCards(0, 2, 'bohu')).toBeNull();
    expect(game.players[0].hand).toHaveLength(1);
  });

  it('拼点请求带上对手和发起者信息', async () => {
    const { game, ctrls } = await setup({});
    giveRank(game, 0, 5);
    giveRank(game, 2, 6);
    await game.pindian(0, 2, 'qimou');
    const r0 = ctrls[0].requests.at(-1)!;
    const r2 = ctrls[2].requests.at(-1)!;
    expect(r0.type === 'selectCards' && r0.pindian).toEqual({ opponent: 2, initiator: true, skill: 'qimou', by: 0 });
    expect(r2.type === 'selectCards' && r2.pindian).toMatchObject({ opponent: 0, initiator: false });
  });
});

describe('拼点提示文字', () => {
  it('说明谁是发起者，并提醒【老将】的 +2', async () => {
    const { game } = await setup({ 1: 'chengpu' });
    const card = giveRank(game, 0, 9);
    const req = (opponent: number, initiator: boolean): Request => ({
      type: 'selectCards',
      cards: [card],
      count: 1,
      reason: 'pindian',
      pindian: { opponent, initiator, skill: 'laojiang', by: opponent },
    });
    const t = describeRequest(game.view(0), req(1, false));
    expect(t).toContain('【老将】');
    expect(t).toContain('平局算你赢');
    expect(t).toContain('对方【老将】点数 +2');
    expect(describeRequest(game.view(0), req(2, true))).not.toContain('+2');
    expect(describeRequest(game.view(1), req(0, true))).toContain('你的点数 +2');
  });
});

describe('许褚【搏虎】', () => {
  it('只能拼攻击范围内有手牌的角色；赢了造成 1 点伤害', async () => {
    const { game } = await setup({ 0: 'xuchu' });
    giveRank(game, 0, 12);
    expect(skillOpt(game, 0, 'bohu')).toBeUndefined();
    giveRank(game, 1, 3);
    giveRank(game, 2, 3);
    giveRank(game, 4, 3);
    // 5 人局：座位 1、4 距离 1，座位 2 距离 2
    expect(skillOpt(game, 0, 'bohu')!.targets).toEqual([1, 4]);
    const hp = game.players[4].hp;
    await game.useSkill(game.players[0], skillOpt(game, 0, 'bohu')!, [], [4]);
    expect(game.players[4].hp).toBe(hp - 1);
    expect(skillOpt(game, 0, 'bohu')).toBeUndefined();
  });

  it('没赢：本回合不能再使用【斩】，下回合恢复', async () => {
    const { game } = await setup({ 0: 'xuchu' });
    giveRank(game, 0, 5);
    giveRank(game, 1, 9);
    give(game, 0, 'zhan');
    // Scripted 拼点出第一张手牌（点数 5 的非【斩】牌），【斩】留在手里
    await game.useSkill(game.players[0], skillOpt(game, 0, 'bohu')!, [], [1]);
    expect(game.players[1].hp).toBe(game.players[1].maxHp);
    expect(game.bohuFailed).toBe(true);
    expect(game.legalPlays(0).some((o) => game.players[0].hand.find((c) => c.id === o.cardId)?.key === 'zhan')).toBe(false);
    await game.runTurn(1);
    expect(game.bohuFailed).toBe(false);
  });
});

describe('法正【奇谋】', () => {
  it('赢了获得双方的拼点牌', async () => {
    const { game } = await setup({ 0: 'fazheng' });
    const a = giveRank(game, 0, 10);
    const b = giveRank(game, 3, 4);
    const pile = game.discardPile.length;
    await game.useSkill(game.players[0], skillOpt(game, 0, 'qimou')!, [], [3]);
    expect(game.players[0].hand).toEqual([a, b]);
    expect(game.players[3].hand).toHaveLength(0);
    expect(game.discardPile.length).toBe(pile);
  });

  it('没赢（含平局）时两张牌进弃牌堆', async () => {
    const { game } = await setup({ 0: 'fazheng' });
    giveRank(game, 0, 6);
    giveRank(game, 3, 6);
    await game.useSkill(game.players[0], skillOpt(game, 0, 'qimou')!, [], [3]);
    expect(game.players[0].hand).toHaveLength(0);
    expect(game.discardPile).toHaveLength(2);
  });
});

describe('程普【老将】', () => {
  it('拼点点数 +2，赢了弃置对方一张牌', async () => {
    const { game } = await setup({ 0: 'chengpu' });
    giveRank(game, 0, 9);
    giveRank(game, 2, 10);
    const sword = equip(game, 2, 'huanshoudao');
    await game.useSkill(game.players[0], skillOpt(game, 0, 'laojiang')!, [], [2]);
    expect(game.players[2].equips.weapon).toBeUndefined();
    expect(game.discardPile.at(-1)).toBe(sword);
    expect(game.log.some((e) => e.text.includes('【老将】算 J'))).toBe(true);
  });

  it('+2 后平局仍算发起者输；最多算 K', async () => {
    const { game } = await setup({ 0: 'chengpu' });
    giveRank(game, 0, 12);
    giveRank(game, 2, 13);
    expect(game.pindianRank(0, game.players[0].hand[0])).toBe(13);
    expect(await game.pindian(0, 2, 'laojiang')).toBe(false);
  });

  it('被别人拼点时同样 +2', async () => {
    const { game } = await setup({ 0: 'xuchu', 1: 'chengpu' });
    giveRank(game, 0, 12);
    giveRank(game, 1, 10);
    expect(await game.pindian(0, 1, 'bohu')).toBe(false);
  });
});

describe('贾诩【乱策】', () => {
  it('令两名有手牌的其他角色拼点，赢家视为对输家使用【斩】', async () => {
    const { game } = await setup({ 0: 'jiaxu' });
    giveRank(game, 2, 11);
    giveRank(game, 3, 4);
    expect(skillOpt(game, 0, 'luance')).toBeUndefined(); // 贾诩没有手牌
    game.players[3].hand = [];
    giveRank(game, 0, 1);
    expect(skillOpt(game, 0, 'luance')).toBeUndefined(); // 只有一名有手牌的角色
    giveRank(game, 3, 4);
    const opt = skillOpt(game, 0, 'luance')!;
    expect(opt.targets).toEqual([2, 3]);
    expect(opt.secondTargets![2]).toEqual([3]);
    const hp = game.players[3].hp;
    await game.useSkill(game.players[0], opt, [game.players[0].hand[0].id], [2, 3]);
    expect(game.players[3].hp).toBe(hp - 1);
    expect(game.players[0].hand).toHaveLength(0); // 贾诩弃置一张手牌
  });

  it('平局时后选的一方赢；目标可以打出【避】', async () => {
    const { game } = await setup({ 0: 'jiaxu' }, (req) => (req.type === 'respond' && req.reason.kind === 'dodge' ? null : undefined));
    giveRank(game, 2, 6);
    giveRank(game, 3, 6);
    giveRank(game, 0, 1);
    await game.useSkill(game.players[0], skillOpt(game, 0, 'luance')!, [game.players[0].hand[0].id], [2, 3]);
    expect(game.players[2].hp).toBe(game.players[2].maxHp - 1);
    expect(game.players[3].hp).toBe(game.players[3].maxHp);
  });

  it('被【斩】的一方可以打出【避】', async () => {
    let biId = -1;
    const { game } = await setup({ 0: 'jiaxu' }, (req) => (req.type === 'respond' && req.reason.kind === 'dodge' ? biId : undefined));
    giveRank(game, 2, 9);
    giveRank(game, 3, 2); // 第一张手牌用于拼点
    biId = give(game, 3, 'bi').id;
    giveRank(game, 0, 1);
    await game.useSkill(game.players[0], skillOpt(game, 0, 'luance')!, [game.players[0].hand[0].id], [2, 3]);
    expect(game.players[3].hp).toBe(game.players[3].maxHp);
    expect(game.players[3].hand).toHaveLength(0);
  });

  it('不计入【斩】次数', async () => {
    const { game } = await setup({ 0: 'jiaxu' });
    giveRank(game, 2, 6);
    giveRank(game, 3, 9);
    giveRank(game, 0, 1);
    await game.useSkill(game.players[0], skillOpt(game, 0, 'luance')!, [game.players[0].hand[0].id], [2, 3]);
    expect(game.zhanUsed).toBe(0);
  });
});

describe('第八批 AI', () => {
  it('AI 拼点：想赢时出点数大的牌，不拿【药】去拼；被队友拼点时出最不值钱的牌', async () => {
    const { game } = await setup({});
    const ai = new BasicAI();
    give(game, 1, 'yao');
    const big = giveRank(game, 1, 12);
    const small = giveRank(game, 1, 2);
    const req = (opponent: number, initiator: boolean): Request => ({
      type: 'selectCards',
      cards: [...game.players[1].hand],
      count: 1,
      reason: 'pindian',
      pindian: { opponent, initiator, skill: 'qimou', by: initiator ? 1 : opponent },
    });
    // 忠臣主动拼点：出大牌
    expect(await ai.decide(game.view(1), req(2, true))).toEqual([big.id]);
    // 被主公（队友）拼点：不在乎输赢，出最不值钱的牌（不出【药】）
    const pick = (await ai.decide(game.view(1), req(0, false))) as number[];
    expect(pick).not.toEqual([game.players[1].hand[0].id]);
    expect([big.id, small.id]).toContain(pick[0]);
  });

  it('有新武将的 AI 对局都能正常结束，牌数守恒', async () => {
    for (let seed = 1; seed <= 15; seed++) {
      const game = new Game({
        controllers: ROLES.map(() => new BasicAI()),
        seed,
        generals: ['xuchu', 'fazheng', 'chengpu', 'jiaxu', 'caocao'],
        roles: ROLES,
        maxTurns: 500,
      });
      await game.start();
      const total = game.drawPile.length + game.discardPile.length + game.players.reduce((n, p) => n + p.hand.length + Object.keys(p.equips).length + p.judge.length, 0);
      expect(total).toBe(89);
    }
  });
});
