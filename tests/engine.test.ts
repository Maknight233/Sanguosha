import { BasicAI } from '../src/ai/basic';
import { describe, expect, it } from 'vitest';
import { buildDeck, DECK_SPEC } from '../src/data/cards';
import { generalDef } from '../src/data/generals';
import { RandomController } from '../src/ai/random';
import { Game, GameOver } from '../src/engine/game';
import { equip, give, makeGame, Scripted } from './helpers';

// 座位：0 主公曹操(5) 1 忠臣郭嘉(3) 2 反贼张辽(4) 3 反贼刘备(4) 4 内奸赵云(4)

describe('牌堆', () => {
  it('张数正确且 id 唯一', () => {
    const deck = buildDeck();
    const total = DECK_SPEC.reduce((s, d) => s + d.count, 0);
    expect(deck).toHaveLength(total);
    expect(new Set(deck.map((c) => c.id)).size).toBe(total);
  });
});

describe('开局', () => {
  it('主公体力 +1，每人 4 张手牌，主公先行', async () => {
    const game = new Game({
      controllers: [0, 1, 2, 3, 4].map(() => new Scripted()),
      seed: 1,
      roles: ['rebel', 'lord', 'loyalist', 'renegade', 'rebel'],
    });
    await game.setup();
    expect(game.current).toBe(1);
    const lord = game.players[1];
    expect(lord.maxHp).toBe(generalDef(lord.general).hp + 1);
    expect(lord.hp).toBe(lord.maxHp);
    for (const p of game.players) expect(p.hand).toHaveLength(4);
    expect(new Set(game.players.map((p) => p.general)).size).toBe(5);
  });

  it('视图隐藏他人手牌与身份（主公除外）', async () => {
    const { game } = await makeGame();
    give(game, 2, 'zhan');
    const v = game.view(3);
    expect(v.players[3].role).toBe('rebel');
    expect(v.players[0].role).toBe('lord');
    expect(v.players[2].role).toBeNull();
    expect(v.players[2].hand).toBeNull();
    expect(v.players[2].handCount).toBe(1);
  });
});

describe('距离', () => {
  it('环形座位取较近方向', async () => {
    const { game } = await makeGame();
    expect(game.distance(0, 1)).toBe(1);
    expect(game.distance(0, 2)).toBe(2);
    expect(game.distance(0, 3)).toBe(2);
    expect(game.distance(0, 4)).toBe(1);
  });

  it('坐骑修正，最小为 1', async () => {
    const { game } = await makeGame();
    equip(game, 0, 'qiji');
    expect(game.distance(0, 2)).toBe(1);
    expect(game.distance(0, 1)).toBe(1);
    equip(game, 2, 'qingcong');
    expect(game.distance(0, 2)).toBe(2);
    expect(game.distance(1, 2)).toBe(2);
  });

  it('阵亡角色不计入距离', async () => {
    const { game } = await makeGame();
    game.players[1].alive = false;
    expect(game.distance(0, 2)).toBe(1);
  });

  it('武器决定攻击范围', async () => {
    const { game } = await makeGame();
    expect(game.inAttackRange(0, 2)).toBe(false);
    equip(game, 0, 'huanshoudao');
    expect(game.inAttackRange(0, 2)).toBe(true);
  });
});

describe('出牌', () => {
  it('【斩】未被【避】则造成 1 点伤害', async () => {
    const { game, ctrls } = await makeGame();
    const zhan = give(game, 0, 'zhan');
    ctrls[0].handler = (_v, req) =>
      req.type === 'play' && req.options.length ? { type: 'use', cardId: zhan.id, target: 1 } : undefined;
    await game.playPhase(game.players[0]);
    expect(game.players[1].hp).toBe(2);
  });

  it('【避】抵消【斩】', async () => {
    const { game, ctrls } = await makeGame();
    const zhan = give(game, 0, 'zhan');
    const bi = give(game, 1, 'bi');
    ctrls[0].handler = (_v, req) =>
      req.type === 'play' && req.options.length ? { type: 'use', cardId: zhan.id, target: 1 } : undefined;
    ctrls[1].handler = (_v, req) => (req.type === 'respond' ? bi.id : undefined);
    await game.playPhase(game.players[0]);
    expect(game.players[1].hp).toBe(3);
    expect(game.players[1].hand).toHaveLength(0);
  });

  it('【斩】每回合限一次', async () => {
    const { game } = await makeGame();
    give(game, 0, 'zhan');
    give(game, 0, 'zhan');
    expect(game.legalPlays(0)).toHaveLength(2);
    game.zhanUsed = 1;
    expect(game.legalPlays(0)).toHaveLength(0);
  });

  it('不能对攻击范围外的角色使用【斩】，非法操作被忽略', async () => {
    const { game, ctrls } = await makeGame();
    const zhan = give(game, 0, 'zhan');
    let tries = 0;
    ctrls[0].handler = (_v, req) => {
      if (req.type !== 'play') return undefined;
      return tries++ === 0 ? { type: 'use', cardId: zhan.id, target: 2 } : { type: 'end' };
    };
    await game.playPhase(game.players[0]);
    expect(game.players[2].hp).toBe(4);
    expect(game.players[0].hand).toHaveLength(1);
  });

  it('满体力不能用【药】，受伤后可以', async () => {
    const { game } = await makeGame();
    give(game, 0, 'yao');
    expect(game.legalPlays(0)).toHaveLength(0);
    game.players[0].hp = 3;
    expect(game.legalPlays(0)).toHaveLength(1);
  });

  it('装备替换旧装备进入弃牌堆', async () => {
    const { game } = await makeGame();
    const old = equip(game, 0, 'huanshoudao');
    const neu = give(game, 0, 'shenbigong');
    game.takeFromHand(game.players[0], neu.id);
    await game.useCard(game.players[0], neu);
    expect(game.players[0].equips.weapon).toBe(neu);
    expect(game.discardPile).toContain(old);
  });
});

describe('濒死与阵亡', () => {
  it('其他角色可以用【药】救人', async () => {
    const { game, ctrls } = await makeGame();
    const yao = give(game, 1, 'yao');
    game.players[0].hp = 1;
    ctrls[1].handler = (_v, req) => (req.type === 'respond' && req.reason.kind === 'save' ? yao.id : undefined);
    await game.damage(2, 0, 1);
    expect(game.players[0].alive).toBe(true);
    expect(game.players[0].hp).toBe(1);
  });

  it('伤害 2 点需要两张【药】', async () => {
    const { game, ctrls } = await makeGame();
    const y1 = give(game, 0, 'yao');
    const y2 = give(game, 0, 'yao');
    const queue = [y1.id, y2.id];
    game.players[0].hp = 1;
    ctrls[0].handler = (_v, req) => (req.type === 'respond' ? queue.shift() ?? null : undefined);
    await game.damage(2, 0, 2);
    expect(game.players[0].hp).toBe(1);
    expect(game.players[0].alive).toBe(true);
  });

  it('击杀反贼摸 3 张牌', async () => {
    const { game } = await makeGame();
    game.players[2].hp = 1;
    await game.damage(4, 2, 1);
    expect(game.players[2].alive).toBe(false);
    expect(game.players[4].hand).toHaveLength(3);
  });

  it('主公误杀忠臣弃置所有牌', async () => {
    const { game } = await makeGame();
    give(game, 0, 'zhan');
    equip(game, 0, 'qiji');
    game.players[1].hp = 1;
    await game.damage(0, 1, 1);
    expect(game.players[1].alive).toBe(false);
    expect(game.players[0].hand).toHaveLength(0);
    expect(game.players[0].equips).toEqual({});
  });

  it('阵亡角色的牌进入弃牌堆', async () => {
    const { game } = await makeGame();
    const c = give(game, 3, 'zhan');
    game.players[3].hp = 1;
    await game.damage(null, 3, 1);
    expect(game.discardPile).toContain(c);
  });
});

describe('胜负判定', () => {
  it('主公阵亡，反贼获胜', async () => {
    const { game } = await makeGame();
    game.players[0].hp = 1;
    await expect(game.damage(2, 0, 1)).rejects.toEqual(new GameOver('rebel'));
  });

  it('主公阵亡且只剩内奸，内奸获胜', async () => {
    const { game } = await makeGame();
    for (const s of [1, 2, 3]) game.players[s].alive = false;
    game.players[0].hp = 1;
    await expect(game.damage(4, 0, 1)).rejects.toEqual(new GameOver('renegade'));
  });

  it('反贼和内奸全灭，主公方获胜', async () => {
    const { game } = await makeGame();
    game.players[2].alive = false;
    game.players[3].alive = false;
    game.players[4].hp = 1;
    await expect(game.damage(1, 4, 1)).rejects.toEqual(new GameOver('lord'));
  });

  it('还有敌人存活时游戏继续', async () => {
    const { game } = await makeGame();
    game.players[2].alive = false;
    expect(game.checkVictory()).toBeNull();
  });
});

describe('弃牌阶段', () => {
  it('手牌弃至体力值', async () => {
    const { game } = await makeGame();
    for (let i = 0; i < 7; i++) give(game, 1, 'zhan');
    await game.discardPhase(game.players[1]);
    expect(game.players[1].hand).toHaveLength(3);
  });

  it('非法弃牌回答时自动弃牌', async () => {
    const { game, ctrls } = await makeGame();
    for (let i = 0; i < 5; i++) give(game, 1, 'zhan');
    ctrls[1].handler = (_v, req) => (req.type === 'discard' ? [999] : undefined);
    await game.discardPhase(game.players[1]);
    expect(game.players[1].hand).toHaveLength(3);
  });
});

/** 场上所有牌的 id（牌堆、弃牌堆、正在判定的牌、手牌、装备、判定区） */
function allCardIds(game: Game): number[] {
  const ids = [...game.drawPile, ...game.discardPile].map((c) => c.id);
  if (game.pendingJudge) ids.push(game.pendingJudge.id);
  for (const p of game.players) ids.push(...p.hand.map((c) => c.id), ...Object.values(p.equips).map((c) => c!.id), ...p.judge.map((j) => j.card.id));
  return ids;
}

describe('随机对局压力测试', () => {
  it('第四批武将同场：任何时刻每张牌只出现在一处', async () => {
    const total = buildDeck().length;
    for (let seed = 1; seed <= 60; seed++) {
      const game = new Game({
        controllers: [0, 1, 2, 3, 4].map(() => new BasicAI()),
        seed,
        generals: ['xunyu', 'weiyan', 'lvmeng', 'yuji', seed % 2 ? 'zhugeliang' : 'caocao'],
        maxTurns: 2000,
      });
      game.subscribe(() => {
        if (game.phase === 'setup') return;
        const ids = allCardIds(game);
        expect(ids).toHaveLength(total);
        expect(new Set(ids).size).toBe(total);
      });
      await game.start();
    }
  }, 60000);

  it('300 局随机对局都能正常结束，牌数守恒', async () => {
    const tally = { lord: 0, rebel: 0, renegade: 0 };
    for (let seed = 1; seed <= 300; seed++) {
      const game = new Game({
        controllers: [0, 1, 2, 3, 4].map((i) => new RandomController(seed * 10 + i)),
        seed,
        maxTurns: 2000,
      });
      const total = buildDeck().length;
      game.subscribe(() => {
        if (game.phase === 'setup') return;
        expect(game.totalCards()).toBe(total);
        expect(new Set(allCardIds(game)).size).toBe(total);
      });
      const winner = await game.start();
      tally[winner]++;
      expect(game.checkVictory()).toBe(winner);
    }
    expect(tally.lord + tally.rebel + tally.renegade).toBe(300);
  }, 60000);
});
