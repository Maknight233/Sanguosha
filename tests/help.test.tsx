// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { GameView, Request } from '../src/engine/types';
import { App } from '../src/ui/App';
import { GameScreen } from '../src/ui/GameScreen';
import { loadTips, pickTip, resetTips, TIPS, type TipContext } from '../src/ui/tips';
import { makeGame } from './helpers';

afterEach(cleanup);
beforeEach(() => localStorage.clear());

const tick = () => act(() => new Promise((r) => setTimeout(r, 0)));

async function ctx(req: Request | null, patch: (v: GameView) => void = () => {}): Promise<TipContext> {
  const { game } = await makeGame();
  game.turn = 1;
  const view = game.view(0);
  patch(view);
  return { view, req, option: null, skill: null };
}

describe('情境提示：选择哪一条', () => {
  it('按优先级给出第一条没看过的，看过的跳过，关闭后都不给', async () => {
    const play: Request = { type: 'play', options: [], skills: [] };
    const c = await ctx(play);
    expect(pickTip(c, { seen: [], off: false })?.id).toBe('start');
    expect(pickTip(c, { seen: ['start'], off: false })?.id).toBe('play');
    expect(pickTip(c, { seen: ['start', 'play'], off: false })).toBeNull();
    expect(pickTip(c, { seen: [], off: true })).toBeNull();
  });

  it('各情境的触发条件', async () => {
    const seenAllBut = (id: string) => ({ seen: TIPS.map((t) => t.id).filter((x) => x !== id), off: false });
    const dodge: Request = { type: 'respond', accept: ['bi'], reason: { kind: 'dodge', source: 2 } };
    expect(pickTip(await ctx(dodge), seenAllBut('dodge'))?.id).toBe('dodge');
    expect(pickTip(await ctx(null), seenAllBut('dodge'))).toBeNull();
    const withJudge = await ctx(null, (v) => (v.players[3].judge = [{ card: { id: 1, key: 'junling', suit: 'spade', rank: 1 }, from: 2 }]));
    expect(pickTip(withJudge, seenAllBut('judge'))?.id).toBe('judge');
    const skill: Request = { type: 'play', options: [], skills: [{ skill: 'qixi', cardCount: 0, targets: [] }] };
    expect(pickTip(await ctx(skill), seenAllBut('skill'))?.id).toBe('skill');
    const target = await ctx({ type: 'play', options: [], skills: [] });
    expect(pickTip({ ...target, option: { cardId: 1, targets: [1, 4] } }, seenAllBut('target'))?.id).toBe('target');
  });
});

describe('提示与速查面板（界面）', () => {
  async function startGame() {
    render(<GameScreen onExit={() => {}} aiDelay={0} seed={77} />);
    for (let i = 0; i < 50 && !document.querySelector('.general-card.clickable'); i++) await tick();
    fireEvent.click(document.querySelector<HTMLElement>('.general-card.clickable')!);
    for (let i = 0; i < 50 && !document.querySelector('.tip-bubble'); i++) await tick();
  }

  it('开局提示显示一次：点「知道了」后不再出现，重新开局也不出现', async () => {
    await startGame();
    expect(document.querySelector('.tip-bubble')!.textContent).toContain('对局开始');
    expect(loadTips().seen).toContain('start');
    fireEvent.click(screen.getByText('知道了'));
    expect(document.querySelector('.tip-bubble')?.textContent ?? '').not.toContain('对局开始');
    cleanup();
    await startGame();
    expect(document.querySelector('.tip-bubble')?.textContent ?? '').not.toContain('对局开始');
  });

  it('「不再显示提示」后全部关闭；速查面板里可以重新打开', async () => {
    await startGame();
    fireEvent.click(screen.getByText('不再显示提示'));
    expect(loadTips().off).toBe(true);
    expect(document.querySelector('.tip-bubble')).toBeNull();
    fireEvent.click(screen.getByLabelText('规则速查'));
    fireEvent.click(screen.getByText('重新显示所有提示'));
    expect(loadTips()).toEqual({ seen: [], off: false });
  });

  it('出牌记录默认隐藏；按钮 / L 打开时游戏暂停、可筛选，Esc 关闭', async () => {
    await startGame();
    expect(document.querySelector('.log')).toBeNull();
    fireEvent.click(screen.getByText('出牌记录'));
    expect(screen.getByText(/游戏已暂停/)).toBeTruthy();
    expect(document.querySelectorAll('.log > div').length).toBeGreaterThan(0);
    const seats = () => [...document.querySelectorAll('.seat-row')].map((e) => e.textContent).join('|');
    const n = seats();
    for (let i = 0; i < 20; i++) await tick();
    expect(seats()).toBe(n);
    fireEvent.click(screen.getByText('本回合'));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(document.querySelector('.log')).toBeNull();
    fireEvent.keyDown(window, { key: 'l' });
    expect(document.querySelector('.log')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('关闭'));
    expect(document.querySelector('.log')).toBeNull();
  });

  it('F1 打开速查：游戏暂停、显示本局 5 名武将，Esc 关闭', async () => {
    await startGame();
    fireEvent.keyDown(window, { key: 'F1' });
    expect(screen.getByText('规则速查')).toBeTruthy();
    expect(screen.getByText(/游戏已暂停/)).toBeTruthy();
    expect(document.querySelectorAll('.help-general')).toHaveLength(5);
    // 暂停期间 AI 不推进：日志条数不变
    const seats = () => [...document.querySelectorAll('.seat-row')].map((e) => e.textContent).join('|');
    const n = seats();
    for (let i = 0; i < 20; i++) await tick();
    expect(seats()).toBe(n);
    // 切换到其他页
    fireEvent.click(screen.getByText('判定与延时锦囊'));
    expect(document.querySelector('.help-body')!.textContent).toContain('判定区');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByText('规则速查')).toBeNull();
  });

  it('主菜单规则说明页使用同一份规则文字', () => {
    resetTips();
    render(<App />);
    fireEvent.click(screen.getByText('规则说明'));
    for (const t of ['回合流程', '距离与攻击范围', '判定与延时锦囊', '身份与胜负', '操作与快捷键']) expect(screen.getByText(t)).toBeTruthy();
    expect(screen.getByText(/打开规则速查/)).toBeTruthy();
  });
});
