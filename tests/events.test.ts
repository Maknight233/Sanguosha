import { describe, expect, it } from 'vitest';
import { recentPlays } from '../src/ui/effects';
import { give, makeGame } from './helpers';

// 座位：0 主公曹操(5) 1 忠臣郭嘉(3) 2 反贼张辽(4) 3 反贼刘备(4) 4 内奸赵云(4)

describe('日志结构化事件', () => {
  it('【斩】命中：use 事件 + damage 事件', async () => {
    const { game, ctrls } = await makeGame();
    const zhan = give(game, 0, 'zhan');
    ctrls[0].handler = (_v, req) =>
      req.type === 'play' && req.options.length ? { type: 'use', cardId: zhan.id, target: 1 } : undefined;
    await game.playPhase(game.players[0]);
    const events = game.log.map((e) => e.event).filter(Boolean);
    expect(events).toContainEqual({ type: 'use', from: 0, to: [1], cards: [zhan], start: true });
    expect(events).toContainEqual({ type: 'damage', seat: 1, amount: 1, from: 0 });
  });

  it('【避】响应记为 use 事件，出牌区按顺序显示两张牌', async () => {
    const { game, ctrls } = await makeGame();
    const zhan = give(game, 0, 'zhan');
    const bi = give(game, 1, 'bi');
    ctrls[0].handler = (_v, req) =>
      req.type === 'play' && req.options.length ? { type: 'use', cardId: zhan.id, target: 1 } : undefined;
    ctrls[1].handler = (_v, req) => (req.type === 'respond' ? bi.id : undefined);
    await game.playPhase(game.players[0]);
    expect(recentPlays(game.log).map((p) => [p.card.key, p.from, p.to])).toEqual([
      ['zhan', 0, [1]],
      ['bi', 1, []],
    ]);
  });

  it('濒死与阵亡事件；新回合清空出牌区', async () => {
    const { game, ctrls } = await makeGame();
    game.players[1].hp = 1;
    const zhan = give(game, 0, 'zhan');
    ctrls[0].handler = (_v, req) =>
      req.type === 'play' && req.options.length ? { type: 'use', cardId: zhan.id, target: 1 } : undefined;
    await game.playPhase(game.players[0]);
    const types = game.log.map((e) => e.event?.type);
    expect(types).toContain('dying');
    expect(types).toContain('death');
    expect(recentPlays(game.log).length).toBeGreaterThan(0);
    game.addLog('—— 新回合 ——', { type: 'turn', seat: 2 });
    expect(recentPlays(game.log)).toEqual([]);
  });
});

describe('出牌区：只显示最近一次结算', () => {
  it('新的结算开始时清掉上一次结算的牌', async () => {
    const { game, ctrls } = await makeGame();
    const z1 = give(game, 0, 'zhan');
    const bi = give(game, 1, 'bi');
    const yao = give(game, 0, 'yao');
    game.players[0].hp = 4;
    let step = 0;
    ctrls[0].handler = (_v, req) => {
      if (req.type !== 'play') return undefined;
      step++;
      if (step === 1) return { type: 'use', cardId: z1.id, target: 1 };
      if (step === 2) return { type: 'use', cardId: yao.id };
      return { type: 'end' };
    };
    ctrls[1].handler = (_v, req) => (req.type === 'respond' ? bi.id : undefined);
    const seen: string[][] = [];
    game.subscribe(() => seen.push(recentPlays(game.log).map((p) => p.card.key)));
    await game.playPhase(game.players[0]);
    expect(seen).toContainEqual(['zhan', 'bi']);
    expect(recentPlays(game.log).map((p) => p.card.key)).toEqual(['yao']);
  });

  it('【檄文】结算中所有响应牌都显示', async () => {
    const { game, ctrls } = await makeGame();
    const xiwen = give(game, 0, 'xiwen');
    const paid = [1, 2, 3].map((s) => give(game, s, 'bi'));
    ctrls[0].handler = (_v, req) =>
      req.type === 'play' && req.options.length ? { type: 'use', cardId: xiwen.id } : undefined;
    for (const s of [1, 2, 3])
      ctrls[s].handler = (_v, req) => (req.type === 'respond' && req.reason.kind === 'xiwen' ? paid[s - 1].id : undefined);
    await game.playPhase(game.players[0]);
    // 座位 4 没有牌，受到伤害
    expect(recentPlays(game.log).map((p) => [p.card.key, p.from])).toEqual([
      ['xiwen', 0],
      ['bi', 1],
      ['bi', 2],
      ['bi', 3],
    ]);
  });
});
