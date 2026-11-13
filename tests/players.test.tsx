// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BasicAI } from '../src/ai/basic';
import { Game, isWinner, LORD_BONUS, PLAYER_COUNTS, ROLE_TABLE } from '../src/engine/game';
import { generalDef } from '../src/data/generals';
import { App } from '../src/ui/App';
import { GameScreen } from '../src/ui/GameScreen';
import { tableSides } from '../src/ui/layout';
import { loadPlayers } from '../src/ui/storage';

afterEach(cleanup);
beforeEach(() => localStorage.clear());

const count = (roles: string[], r: string) => roles.filter((x) => x === r).length;

describe('人数 5–8', () => {
  it('身份配置：主公方与反贼人数相等（5 人除外），6、8 人有 2 名内奸', () => {
    expect(PLAYER_COUNTS.map((n) => ['loyalist', 'rebel', 'renegade'].map((r) => count(ROLE_TABLE[n], r)))).toEqual([
      [1, 2, 1],
      [1, 2, 2],
      [2, 3, 1],
      [2, 3, 2],
    ]);
    for (const n of PLAYER_COUNTS) {
      expect(ROLE_TABLE[n]).toHaveLength(n);
      expect(count(ROLE_TABLE[n], 'lord')).toBe(1);
    }
    expect(PLAYER_COUNTS.map((n) => LORD_BONUS[n])).toEqual([1, 1, 0, 0]);
  });

  it('两名内奸：只有存活的那名算获胜', () => {
    expect(isWinner({ role: 'renegade', alive: true }, 'renegade')).toBe(true);
    expect(isWinner({ role: 'renegade', alive: false }, 'renegade')).toBe(false);
    expect(isWinner({ role: 'loyalist', alive: false }, 'lord')).toBe(true);
    expect(isWinner({ role: 'rebel', alive: false }, 'rebel')).toBe(true);
  });

  it('6 人局主公体力上限 +1，7 人局不加', async () => {
    for (const [n, bonus] of [[6, 1], [7, 0]]) {
      const game = new Game({ controllers: Array.from({ length: n }, () => new BasicAI()), seed: 3 });
      await game.setup();
      const lord = game.players.find((p) => p.role === 'lord')!;
      expect(lord.maxHp).toBe(generalDef(lord.general).hp + bonus);
    }
  });

  it('其他人数的控制器数量会报错', () => {
    expect(() => new Game({ controllers: [0, 1, 2].map(() => new BasicAI()) })).toThrow();
  });

  it.each([6, 7, 8])('%i 人局：AI 能打完，身份按表分配', async (n) => {
    for (const seed of [1, 2, 3]) {
      const game = new Game({ controllers: Array.from({ length: n }, () => new BasicAI()), seed, maxTurns: 600 });
      const w = await game.start();
      expect(['lord', 'rebel', 'renegade']).toContain(w);
      expect(game.players.map((p) => p.role).sort()).toEqual([...ROLE_TABLE[n]].sort());
      expect(new Set(game.players.map((p) => p.general)).size).toBe(n);
    }
  });

  it('牌桌座位：从右手边逆时针，右侧 → 上方 → 左侧，覆盖全部其他座位', () => {
    expect(tableSides(5)).toEqual({ right: [1], top: [2, 3], left: [4] });
    expect(tableSides(8)).toEqual({ right: [1, 2], top: [3, 4, 5], left: [6, 7] });
    for (const n of PLAYER_COUNTS) {
      const s = tableSides(n);
      expect([...s.right, ...s.top, ...s.left]).toEqual(Array.from({ length: n - 1 }, (_, i) => i + 1));
    }
  });

  it('主菜单选择人数并记住；8 人局牌桌显示 7 名电脑', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '8 人' }));
    expect(loadPlayers()).toBe(8);
    expect(screen.getByText(/与 7 名电脑对战/)).toBeTruthy();
    expect(screen.getByText(/主公 1、忠臣 2、反贼 3、内奸 2/)).toBeTruthy();
    cleanup();
    const { container } = render(<GameScreen onExit={() => {}} players={8} aiDelay={0} seed={5} />);
    expect(container.querySelectorAll('.seat-row [data-seat]')).toHaveLength(7);
    expect(container.querySelector('.table.crowded')).toBeTruthy();
  });
});
