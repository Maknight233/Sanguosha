// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../src/ui/App';
import { GameScreen } from '../src/ui/GameScreen';

afterEach(cleanup);

const tick = () => act(() => new Promise((r) => setTimeout(r, 0)));

function button(text: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === text && !b.disabled) as
    | HTMLButtonElement
    | undefined;
}

function usableHandCards(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('.player-area .me-main .hand .card:not(.disabled)')];
}

const isCard = (el: HTMLElement, name: string) => el.dataset.card === name;

interface Stats {
  zhanPlayed: number;
  dodged: number;
  discarded: number;
  modals: number;
}

/**
 * 只通过点击界面来操作的「模拟玩家」：
 * 能出【斩】就点【斩】→ 点目标 → 确定；被【斩】时点【避】→ 确定；弃牌时逐张点选；弹窗点第一个选项。
 */
async function botStep(stats: Stats): Promise<'over' | 'acted' | 'idle'> {
  if (screen.queryByText('再来一局')) return 'over';
  const prompt = document.querySelector('.prompt')?.textContent ?? '';

  // 弹窗类请求
  const modal = document.querySelector<HTMLElement>('.modal');
  if (modal) {
    stats.modals++;
    const general = modal.querySelector<HTMLElement>('.general-card.clickable');
    if (general) return fireEvent.click(general), 'acted';
    const cards = [...modal.querySelectorAll<HTMLElement>('.card.clickable')];
    const confirm = [...modal.querySelectorAll('button')].find((b) => b.textContent === '确定');
    if (confirm) {
      // selectCards / orderCards：依次点选直到可以确定
      for (const c of cards) {
        if (!(confirm as HTMLButtonElement).disabled) break;
        if (!c.classList.contains('selected')) fireEvent.click(c);
      }
      fireEvent.click(confirm);
      return 'acted';
    }
    const first = modal.querySelector<HTMLElement>('button, .card.clickable');
    if (first) return fireEvent.click(first), 'acted';
  }

  if (prompt.startsWith('出牌阶段')) {
    const zhan = usableHandCards().find((c) => isCard(c, '斩'));
    if (zhan) {
      fireEvent.click(zhan);
      // 只有一个目标时已自动选中，直接确定
      if (button('确定')) {
        stats.zhanPlayed++;
        fireEvent.click(button('确定')!);
        return 'acted';
      }
      const seat = document.querySelector<HTMLElement>('.seat.selectable');
      if (seat) {
        fireEvent.click(seat);
        const ok = button('确定');
        if (ok) {
          stats.zhanPlayed++;
          fireEvent.click(ok);
          return 'acted';
        }
      }
    }
    fireEvent.click(button('结束出牌')!);
    return 'acted';
  }
  if (prompt.includes('是否打出【避】')) {
    const bi = usableHandCards().find((c) => isCard(c, '避'));
    if (bi) {
      if (!bi.classList.contains('selected')) fireEvent.click(bi);
      stats.dodged++;
      fireEvent.click(button('确定')!);
      return 'acted';
    }
  }
  if (prompt.startsWith('弃牌阶段')) {
    const n = Number(prompt.match(/弃置 (\d+) 张/)![1]);
    const cards = usableHandCards();
    for (let i = 0; i < n; i++) fireEvent.click(cards[i]);
    stats.discarded += n;
    fireEvent.click(button('确定')!);
    return 'acted';
  }
  const no = button('不出');
  if (no) return fireEvent.click(no), 'acted';
  return 'idle';
}

describe('界面', () => {
  it('主菜单可进入规则说明并返回', async () => {
    render(<App />);
    fireEvent.click(screen.getByText('规则说明'));
    expect(screen.getByText('身份与胜负')).toBeTruthy();
    expect(screen.getAllByText(/【斩】×31/).length).toBe(1);
    fireEvent.click(screen.getByText('← 返回'));
    expect(screen.getByText('开始游戏')).toBeTruthy();
  });

  it('模拟玩家通过点击界面完整打完多局', async () => {
    const total: Stats = { zhanPlayed: 0, dodged: 0, discarded: 0, modals: 0 };
    let finished = 0;
    for (const seed of [11, 22, 33, 44, 55]) {
      cleanup();
      render(<GameScreen onExit={() => {}} aiDelay={0} seed={seed} />);
      let result: string = 'idle';
      for (let step = 0; step < 20000 && result !== 'over'; step++) {
        await tick();
        result = await botStep(total);
      }
      expect(result).toBe('over');
      finished++;
      // 结算界面展示所有身份
      expect(screen.getByText(/获胜，共 \d+ 回合/)).toBeTruthy();
    }
    expect(finished).toBe(5);
    // 确认关键交互路径确实被走到
    expect(total.zhanPlayed).toBeGreaterThan(0);
    expect(total.dodged).toBeGreaterThan(0);
    expect(total.discarded).toBeGreaterThan(0);
    expect(total.modals).toBeGreaterThan(0);
    expect(document.querySelector('.log')!.textContent).toContain('游戏结束');
  }, 120000);
});
