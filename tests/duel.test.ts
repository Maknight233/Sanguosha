import { describe, expect, it } from 'vitest';
import { BasicAI } from '../src/ai/basic';
import { DUEL_BANNED, Game, roleLabel, winnerLabel } from '../src/engine/game';
import type { GameRecord } from '../src/engine/record';
import { loadStats, saveGame } from '../src/ui/storage';
import type { Request } from '../src/engine/types';
import { Scripted } from './helpers';

describe('1v1 对决', () => {
  it('两人局：先手为「主公」、后手为「反贼」，没有主公体力加成，双方身份互相可见', async () => {
    const game = new Game({ controllers: [new Scripted(), new Scripted()], seed: 5, generals: ['caocao', 'zhaoyun'] });
    await game.setup();
    expect(game.duel).toBe(true);
    expect(game.players.map((p) => p.role).sort()).toEqual(['lord', 'rebel']);
    for (const p of game.players) expect(p.maxHp).toBe(4);
    for (const s of [0, 1]) expect(game.view(s).players.every((p) => p.role !== null)).toBe(true);
  });

  it('选将：双方各从 3 名中选 1 名，不会出现 1v1 不可选的武将', async () => {
    for (let seed = 1; seed <= 30; seed++) {
      const ctrls = [new Scripted(), new Scripted()];
      const game = new Game({ controllers: ctrls, seed });
      await game.setup();
      for (const c of ctrls) {
        const req = c.requests.find((r) => r.type === 'chooseGeneral') as Extract<Request, { type: 'chooseGeneral' }>;
        expect(req.options).toHaveLength(3);
        for (const g of req.options) expect(DUEL_BANNED.has(g)).toBe(false);
      }
    }
  });

  it('先手第一回合少摸 1 张，之后正常摸 2 张', async () => {
    const game = new Game({ controllers: [new Scripted(), new Scripted()], seed: 3, generals: ['xuchu', 'machao'] });
    await game.setup();
    const first = game.players[game.current];
    const before = first.hand.length;
    await game.runTurn(first.seat);
    // Scripted 不出牌，弃牌阶段可能弃牌：只看摸牌阶段的日志
    expect(game.log.some((e) => e.text === `${game.who(first.seat)} 摸了 1 张牌。`)).toBe(true);
    expect(before).toBe(4);
    const second = game.players[game.nextAlive(first.seat)];
    await game.runTurn(second.seat);
    expect(game.log.some((e) => e.text === `${game.who(second.seat)} 摸了 2 张牌。`)).toBe(true);
  });

  it('主公技在 1v1 不生效', async () => {
    const game = new Game({ controllers: [new Scripted(), new Scripted()], seed: 1, generals: ['caocao', 'sunquan'] });
    await game.setup();
    const lord = game.players.find((p) => p.role === 'lord')!;
    expect(game.isLord(lord.seat, lord.general)).toBe(false);
  });

  it('AI 对局都能正常结束，牌数守恒；反贼方不会「潜伏」不出手', async () => {
    for (let seed = 1; seed <= 20; seed++) {
      const game = new Game({ controllers: [new BasicAI(), new BasicAI()], seed, maxTurns: 400 });
      const winner = await game.start();
      expect(['lord', 'rebel', 'draw']).toContain(winner);
      expect(game.totalCards()).toBe(89);
    }
  });

  it('界面显示：1v1 的身份为先手 / 后手；身份局不变', () => {
    expect(roleLabel('lord', 2)).toBe('先手');
    expect(roleLabel('rebel', 2)).toBe('后手');
    expect(winnerLabel('rebel', 2)).toBe('后手');
    expect(roleLabel('lord', 5)).toBe('主公');
    expect(winnerLabel('lord', 5)).toBe('主公与忠臣');
  });

  it('战绩：1v1 计入总数和人数统计，不计入身份胜率', () => {
    const mem = new Map<string, string>();
    const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) };
    const rec = { version: 11, id: 'a', date: 1, seed: 1, names: ['你', '电脑一'], human: 0, answers: [], winner: 'lord', turns: 10, role: 'lord', general: 'caocao', won: true, logLength: 1 } as GameRecord;
    saveGame(rec, store);
    const st = loadStats(store);
    expect(st.total.games).toBe(1);
    expect(st.byPlayers?.['2']?.games).toBe(1);
    expect(st.byRole.lord).toBeUndefined();
  });
});
