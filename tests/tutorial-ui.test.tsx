// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../src/ui/App';
import { GameScreen } from '../src/ui/GameScreen';
import { emptyStats, loadRecords, loadTutorialAsked } from '../src/ui/storage';

afterEach(cleanup);
beforeEach(() => localStorage.clear());

const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
const card = (name: string) => document.querySelector<HTMLElement>(`.me-main .hand .card[data-card="${name}"]:not(.disabled)`)!;
const seat = (n: number) => document.querySelector<HTMLElement>(`.seat[data-seat="${n}"]`)!;
const bubble = () => document.querySelector('.tutorial-bubble')?.textContent ?? '';
const flush = () => act(() => new Promise<void>((r) => setTimeout(r, 0)));

describe('第一次打开的教程提示', () => {
  it('点「不用」直接跳过，之后不再问；菜单里仍有入口', () => {
    const first = render(<App />);
    expect(screen.getByText('第一次来玩？')).toBeTruthy();
    click('不用，直接玩');
    expect(screen.queryByText('第一次来玩？')).toBeNull();
    expect(loadTutorialAsked()).toBe(true);
    expect(screen.getByRole('button', { name: '新手教程' })).toBeTruthy();
    first.unmount();
    render(<App />);
    expect(screen.queryByText('第一次来玩？')).toBeNull();
  });

  it('打过对局的老玩家不会被问', () => {
    localStorage.setItem('sanguo.stats', JSON.stringify({ ...emptyStats(), total: { games: 3, wins: 1 } }));
    render(<App />);
    expect(screen.queryByText('第一次来玩？')).toBeNull();
  });

  it('点「开始教程」进入教学局', async () => {
    render(<App />);
    click('开始教程');
    await waitFor(() => expect(bubble()).toContain('欢迎'));
    expect(loadTutorialAsked()).toBe(true);
  });
});

describe('教学局界面', () => {
  it('讲解点「下一步」，操作必须按提示来，走完后显示「教程完成」且不保存记录', async () => {
    let played = false;
    render(<GameScreen tutorial aiDelay={0} onExit={() => {}} onTutorialPlay={() => (played = true)} />);
    await waitFor(() => expect(bubble()).toContain('欢迎'));
    const next = async () => {
      for (let i = 0; i < 50; i++) {
        const b = screen.queryByRole('button', { name: '下一步' });
        if (b) fireEvent.click(b);
        else if (bubble().includes('👉') || screen.queryByText('教程完成')) return;
        await flush();
      }
      throw new Error(`教程卡住了：${bubble()}`);
    };
    await next();
    expect(bubble()).toContain('0/9');

    // 不按提示：直接结束出牌 → 被拦下并提醒，仍停在这一步
    click('结束出牌');
    await flush();
    expect(bubble()).toContain('这一步请按提示操作');
    expect(bubble()).toContain('0/9');

    const use = async (name: string, target?: number) => {
      fireEvent.click(card(name));
      if (target !== undefined) fireEvent.click(seat(target));
      click('确定');
      await flush();
      await next();
    };
    await use('斩', 1);
    expect(bubble()).toContain('1/9');
    await use('环首刀');
    await use('调兵');
    const confirm = async (name: string) => {
      click(name);
      await flush();
      await next();
    };
    await confirm('结束出牌');
    await use('斩'); // 弃牌
    await confirm('确定'); // 【避】已预选
    await confirm('确定'); // 【识破】已预选
    await use('药');
    await use('斩', 1);
    expect(screen.getByText('教程完成')).toBeTruthy();
    expect(loadRecords()).toHaveLength(0);
    click('开始正式对局');
    expect(played).toBe(true);
  }, 30000);
});
