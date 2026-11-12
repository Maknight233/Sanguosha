// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { DRAW_GAME_PILES, Game, isWinner, WINNER_NAME } from '../src/engine/game';
import { RECORD_VERSION, type GameRecord } from '../src/engine/record';
import { loadRecords, loadStats, saveGame } from '../src/ui/storage';
import { Scripted, makeGame } from './helpers';

beforeEach(() => localStorage.clear());

describe('平局：牌堆被摸光 7 次', () => {
  it('没人动手的对局在牌堆第 7 次摸光时以平局结束', async () => {
    // 所有人都只摸牌、弃牌
    const game = new Game({ controllers: [0, 1, 2, 3, 4].map(() => new Scripted()), seed: 7, maxTurns: 2000 });
    const winner = await game.start();
    expect(winner).toBe('draw');
    expect(game.pileExhausted).toBe(DRAW_GAME_PILES);
    expect(game.phase).toBe('over');
    expect(game.players.every((p) => p.alive)).toBe(true);
    expect(game.checkVictory()).toBeNull();
    expect(game.log.at(-1)!.text).toBe('游戏结束，平局！');
    expect(game.log.at(-2)!.text).toBe(`牌堆第 ${DRAW_GAME_PILES} 次被摸光。`);
    expect(game.log.filter((l) => l.text === '弃牌堆洗入牌堆。')).toHaveLength(DRAW_GAME_PILES - 1);
    expect(game.players.some((p) => isWinner(p, winner))).toBe(false);
    expect(WINNER_NAME.draw).toBe('平局');
  });

  it('前 6 次摸光只洗牌，次数对所有人公开', async () => {
    const { game } = await makeGame();
    for (let i = 1; i < DRAW_GAME_PILES; i++) {
      game.discardPile.push(...game.drawPile.splice(0));
      game.takeTop(1);
      expect(game.pileExhausted).toBe(i);
      expect(game.view(0).pileExhausted).toBe(i);
    }
    game.discardPile.push(...game.drawPile.splice(0));
    expect(() => game.takeTop(1)).toThrow();
  });

  it('平局保存记录但不计入战绩', () => {
    const rec: GameRecord = {
      version: RECORD_VERSION, id: 'd1', date: 1, seed: 1, names: ['你', 'a', 'b', 'c', 'd'], human: 0, answers: [],
      winner: 'draw', turns: 200, role: 'rebel', general: 'guojia', won: false, level: 'normal', logLength: 10,
    };
    saveGame(rec);
    expect(loadRecords()).toHaveLength(1);
    expect(loadStats().total).toEqual({ games: 0, wins: 0 });
    saveGame({ ...rec, id: 'w1', winner: 'rebel', won: true });
    expect(loadStats().total).toEqual({ games: 1, wins: 1 });
  });
});
