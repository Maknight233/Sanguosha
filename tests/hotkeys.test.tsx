// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { Card, Request } from '../src/engine/types';
import { autoPickForRespond, autoTargetsForOption, autoTargetsForSkill, indexKey, keyAction, keyIndex } from '../src/ui/hotkeys';
import { GameScreen } from '../src/ui/GameScreen';

afterEach(cleanup);

const card = (id: number, key: string): Card => ({ id, key, suit: 'spade', rank: 5 }) as Card;
const key = (k: string, extra: Partial<KeyboardEvent> = {}) =>
  keyAction({ key: k, ctrlKey: false, metaKey: false, altKey: false, repeat: false, ...extra });

describe('自动选中', () => {
  it('出牌：只有一个目标时选中，多个或无需目标时不选', () => {
    expect(autoTargetsForOption({ cardId: 1, targets: [3] })).toEqual([3]);
    expect(autoTargetsForOption({ cardId: 1, targets: [2, 3] })).toEqual([]);
    expect(autoTargetsForOption({ cardId: 1, targets: [] })).toEqual([]);
    // 镔铁大戟：只自动选主目标
    expect(autoTargetsForOption({ cardId: 1, targets: [2], extraTargets: { 2: [3] } })).toEqual([2]);
  });

  it('技能：第一目标唯一时选中', () => {
    expect(autoTargetsForSkill({ skill: 'kuanren', cardCount: 1, targets: [4] })).toEqual([4]);
    expect(autoTargetsForSkill({ skill: 'fencheng', cardCount: 0, targets: [] })).toEqual([]);
    expect(autoTargetsForSkill({ skill: 'huoxin', cardCount: 2, targets: [1, 2], secondTargets: {} })).toEqual([]);
  });

  it('响应：只有一张能出的牌时预先选中', () => {
    const req: Request = { type: 'respond', accept: ['bi'], reason: { kind: 'dodge', source: 1 } };
    expect(autoPickForRespond(req, [card(1, 'zhan'), card(2, 'bi')])).toEqual([2]);
    expect(autoPickForRespond(req, [card(1, 'bi'), card(2, 'bi')])).toEqual([]);
    expect(autoPickForRespond(req, [card(1, 'zhan')])).toEqual([]);
    expect(autoPickForRespond({ type: 'discard', count: 1 }, [card(1, 'bi')])).toEqual([]);
  });
});

describe('按键映射', () => {
  it('数字键与序号互相转换', () => {
    expect([0, 8, 9, 10].map(indexKey)).toEqual(['1', '9', '0', undefined]);
    expect(['1', '9', '0', 'a'].map(keyIndex)).toEqual([0, 8, 9, -1]);
  });

  it('各按键对应的动作', () => {
    expect(key(' ')).toEqual({ type: 'confirm' });
    expect(key('Enter')).toEqual({ type: 'confirm' });
    expect(key('Escape')).toEqual({ type: 'cancel' });
    expect(key('E')).toEqual({ type: 'end' });
    expect(key('w')).toEqual({ type: 'skill', index: 1 });
    expect(key('Tab')).toEqual({ type: 'nextTarget' });
    expect(key('3')).toEqual({ type: 'index', index: 2 });
    expect(key('x')).toBeNull();
  });

  it('修饰键组合与长按重复被忽略', () => {
    expect(key('1', { ctrlKey: true })).toBeNull();
    expect(key(' ', { repeat: true })).toBeNull();
  });
});

// ───────────── 只用键盘打完整局 ─────────────

const tick = () => act(() => new Promise((r) => setTimeout(r, 0)));
const press = (k: string) => fireEvent.keyDown(window, { key: k });
const hand = () => [...document.querySelectorAll<HTMLElement>('.player-area .me-main .hand .card')];
const confirmReady = () =>
  [...document.querySelectorAll<HTMLButtonElement>('.player-area button')].some((b) => b.textContent === '确定' && !b.disabled);

interface Stats {
  zhan: number;
  auto: number;
  tabbed: number;
  dodged: number;
  passed: number;
  discarded: number;
  modals: number;
}

function keyStep(s: Stats): 'over' | 'acted' | 'idle' {
  if (screen.queryByText('再来一局')) return 'over';
  const prompt = document.querySelector('.prompt')?.textContent ?? '';
  const modal = document.querySelector<HTMLElement>('.modal');
  if (modal) {
    s.modals++;
    const confirm = [...modal.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === '确定');
    if (confirm) {
      // 选牌/排序：依次按数字键直到可以确定，再按空格
      const n = modal.querySelectorAll('.card').length;
      for (let i = 0; i < n && confirm.disabled; i++) press(String(i + 1));
      press(' ');
    } else press('1');
    return 'acted';
  }
  if (prompt.startsWith('出牌阶段')) {
    const i = hand().findIndex((c) => c.dataset.card === '斩' && !c.classList.contains('disabled'));
    if (i >= 0 && i < 10) {
      press(String((i + 1) % 10));
      if (confirmReady()) s.auto++;
      if (!confirmReady() && document.querySelector('.seat.selectable')) {
        press('Tab');
        s.tabbed++;
      }
      if (confirmReady()) {
        s.zhan++;
        press(' ');
        return 'acted';
      }
      press('Escape');
    }
    press('e');
    return 'acted';
  }
  if (prompt.includes('是否打出【避】')) {
    const bi = hand().findIndex((c) => c.dataset.card === '避');
    if (bi >= 0 && bi < 10) {
      if (!hand()[bi].classList.contains('selected')) press(String((bi + 1) % 10));
      press('Enter');
      s.dodged++;
      return 'acted';
    }
  }
  if (prompt.startsWith('弃牌阶段')) {
    const n = Number(prompt.match(/弃置 (\d+) 张/)![1]);
    for (let i = 0; i < n; i++) press(String(i + 1));
    press(' ');
    s.discarded += n;
    return 'acted';
  }
  if ([...document.querySelectorAll('button')].some((b) => b.textContent === '不出')) {
    // 有选中的牌时第一次 Esc 只是取消选择
    if (hand().some((c) => c.classList.contains('selected'))) press('Escape');
    press('Escape');
    s.passed++;
    return 'acted';
  }
  return 'idle';
}

describe('键盘操作', () => {
  it('只用快捷键完整打完多局', async () => {
    const s: Stats = { zhan: 0, auto: 0, tabbed: 0, dodged: 0, passed: 0, discarded: 0, modals: 0 };
    for (const seed of [7, 18, 29, 40]) {
      cleanup();
      render(<GameScreen onExit={() => {}} aiDelay={0} seed={seed} />);
      let result = 'idle';
      for (let step = 0; step < 20000 && result !== 'over'; step++) {
        await tick();
        result = keyStep(s);
      }
      expect(result).toBe('over');
    }
    expect(s.zhan).toBeGreaterThan(0);
    expect(s.auto).toBeGreaterThan(0); // 唯一目标被自动选中
    expect(s.tabbed).toBeGreaterThan(0);
    expect(s.dodged + s.passed).toBeGreaterThan(0);
    expect(s.discarded).toBeGreaterThan(0);
    expect(s.modals).toBeGreaterThan(0);
  }, 120000);

  it('打开武将详情时快捷键不生效，Esc 关闭面板', async () => {
    render(<GameScreen onExit={() => {}} aiDelay={0} seed={5} />);
    for (let i = 0; i < 50 && !document.querySelector('.general-card.clickable'); i++) await tick();
    fireEvent.click(document.querySelector<HTMLElement>('.info-btn')!);
    expect(document.querySelector('.inspect')).toBeTruthy();
    press('1'); // 不应选将
    await tick();
    expect(document.querySelector('.inspect')).toBeTruthy();
    press('Escape');
    await tick();
    expect(document.querySelector('.inspect')).toBeNull();
    expect(document.querySelector('.general-card.clickable')).toBeTruthy();
    press('1');
    await tick();
    expect(document.querySelector('.general-card.clickable')).toBeNull();
  });
});
