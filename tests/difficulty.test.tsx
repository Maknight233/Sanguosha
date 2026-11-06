// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BasicAI } from '../src/ai/basic';
import { HELP_WEIGHT } from '../src/engine/game';
import type { GameRecord } from '../src/engine/record';
import type { PlayAction, Request } from '../src/engine/types';
import { App } from '../src/ui/App';
import { loadLevel, loadStats, saveGame } from '../src/ui/storage';
import { give, makeGame } from './helpers';

// 身份：0 主公 1 忠臣 2 反贼 3 反贼 4 内奸；0 与 1、4 距离 1

const easy = new BasicAI('easy');
const normal = new BasicAI('normal');
const save = (dying: number): Request => ({ type: 'respond', accept: ['yao'], reason: { kind: 'save', dying } });

afterEach(cleanup);
beforeEach(() => localStorage.clear());

describe('简单 AI', () => {
  it('随便挑目标：普通反贼总是集火主公，简单反贼在不同回合打不同的敌人', async () => {
    const { game } = await makeGame();
    give(game, 2, 'zhan');
    game.markHelp(1, 0, HELP_WEIGHT.save); // 1、4 号救过主公 → 偏忠 → 都是反贼的敌人
    game.markHelp(4, 0, HELP_WEIGHT.save);
    // 假设 0、1、4 号都在攻击范围内
    const req = (): Request => ({ type: 'play', options: game.legalPlays(2).map((o) => ({ ...o, targets: [0, 1, 4] })), skills: [] });
    const picks = { normal: new Set<number>(), easy: new Set<number>() };
    for (let turn = 1; turn <= 20; turn++) {
      game.turn = turn;
      for (const [k, ai] of [['normal', normal], ['easy', easy]] as const) {
        const a = (await ai.decide(game.view(2), req())) as PlayAction;
        if (a.type === 'use' && a.target !== undefined) picks[k].add(a.target);
      }
    }
    expect([...picks.normal]).toEqual([0]);
    expect(picks.easy.size).toBeGreaterThan(1);
  });

  it('不用【识破】', async () => {
    const { game } = await makeGame();
    give(game, 1, 'shipo');
    const req: Request = { type: 'respond', accept: ['shipo'], reason: { kind: 'shipo', trick: 'jieying', user: 2, target: 0, countering: false } };
    expect(await normal.decide(game.view(1), req)).not.toBeNull();
    expect(await easy.decide(game.view(1), req)).toBeNull();
  });

  it('只救自己和主公（反贼不救主公）', async () => {
    const { game } = await makeGame();
    const y1 = give(game, 1, 'yao');
    give(game, 2, 'yao');
    game.markHelp(3, 2, HELP_WEIGHT.save);
    expect(await easy.decide(game.view(1), save(0))).toBe(y1.id); // 忠臣救主公
    expect(await easy.decide(game.view(1), save(1))).toBe(y1.id); // 救自己
    expect(await easy.decide(game.view(2), save(0))).toBeNull(); // 反贼不救主公
    expect(await easy.decide(game.view(2), save(3))).toBeNull(); // 不救同伴
  });
});

describe('难度选择', () => {
  it('主菜单选择难度并记住，记录与战绩按难度区分', async () => {
    render(<App />);
    expect(loadLevel()).toBe('normal');
    fireEvent.click(screen.getByText('简单'));
    expect(loadLevel()).toBe('easy');
    expect(screen.getByText(/简单：电脑随便挑攻击目标/)).toBeTruthy();

    const rec = { id: 'x', date: 0, role: 'rebel', general: 'liubei', won: true, answers: [], winner: 'rebel', turns: 9, level: 'easy' } as unknown as GameRecord;
    saveGame(rec);
    saveGame({ ...rec, id: 'y', won: false, level: undefined });
    const s = loadStats();
    expect(s.byLevel?.easy).toEqual({ games: 1, wins: 1 });
    expect(s.byLevel?.normal).toEqual({ games: 1, wins: 0 }); // 旧记录视为普通

    fireEvent.click(screen.getByText('对局记录'));
    const rows = [...document.querySelectorAll('.records-table tbody tr')].map((r) => r.textContent);
    expect(rows[0]).toContain('普通');
    expect(rows[1]).toContain('简单');
  });

  it('开始游戏后牌桌显示当前难度', async () => {
    localStorage.setItem('sanguo.level', 'easy');
    render(<App />);
    fireEvent.click(screen.getByText('开始游戏'));
    expect(document.querySelector('.center-info')!.textContent).toContain('AI 简单');
  });
});
