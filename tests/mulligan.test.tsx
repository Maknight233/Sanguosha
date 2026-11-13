// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BasicAI } from '../src/ai/basic';
import { Game } from '../src/engine/game';
import { type Answer, type GameRecord, RECORD_VERSION, RecordingController, replay } from '../src/engine/record';
import { GameScreen } from '../src/ui/GameScreen';
import { Scripted } from './helpers';

/** 前 times 次刷牌，之后确定；记下每次看到的手牌 */
function mulliganer(times: number) {
  const hands: number[][] = [];
  const c = new Scripted((view, req) => {
    if (req.type !== 'mulligan') return undefined;
    hands.push(view.players[view.me].hand!.map((x) => x.id));
    return hands.length <= times;
  });
  return { c, hands };
}

describe('刷牌', () => {
  it('只询问指定座位；每次刷新全部 4 张手牌，牌数守恒，记一条日志', async () => {
    const { c, hands } = mulliganer(3);
    const others = [1, 2, 3, 4].map(() => new Scripted());
    const game = new Game({ controllers: [c, ...others], seed: 12, mulligan: [0] });
    await game.setup();
    expect(hands).toHaveLength(4);
    for (const h of hands) expect(h).toHaveLength(4);
    expect(new Set(hands.map((h) => h.join(','))).size).toBe(4);
    expect(game.players[0].hand.map((x) => x.id)).toEqual(hands[3]);
    expect(game.totalCards()).toBe(89);
    for (const o of others) expect(o.requests.some((r) => r.type === 'mulligan')).toBe(false);
    expect(game.log.some((e) => e.text.includes('刷新了 3 次起始手牌'))).toBe(true);
  });

  it('不刷也不留日志；不指定座位时不询问', async () => {
    const { c, hands } = mulliganer(0);
    const game = new Game({ controllers: [c, ...[1, 2, 3, 4].map(() => new Scripted())], seed: 12, mulligan: [0] });
    await game.setup();
    expect(hands).toHaveLength(1);
    expect(game.log.some((e) => e.text.includes('刷新'))).toBe(false);
    const plain = new Scripted();
    await new Game({ controllers: [plain, ...[1, 2, 3, 4].map(() => new Scripted())], seed: 12 }).setup();
    expect(plain.requests.some((r) => r.type === 'mulligan')).toBe(false);
  });

  it('刷过牌的对局可以回放', async () => {
    const answers: Answer[] = [];
    const { c } = mulliganer(2);
    const ctrls = [c, new BasicAI(), new BasicAI(), new BasicAI(), new BasicAI()].map((x, s) => new RecordingController(x, s, answers));
    const game = new Game({ controllers: ctrls, seed: 31, mulligan: [0], maxTurns: 2000 });
    const winner = await game.start();
    const rec: GameRecord = {
      version: RECORD_VERSION, id: 'm', date: 1, seed: 31, names: game.players.map((p) => p.name), human: 0, answers: [...answers],
      winner, turns: game.turn, role: game.players[0].role, general: game.players[0].general, won: false, logLength: game.log.length, mulligan: [0],
    };
    expect((await replay(rec)).error).toBeNull();
  });
});

describe('刷牌（界面）', () => {
  it('选将后弹出刷牌框：点「刷牌」换掉全部手牌，按 R 也可以；点「确定」开始游戏', async () => {
    const tick = () => act(() => new Promise((r) => setTimeout(r, 0)));
    render(<GameScreen onExit={() => {}} aiDelay={0} seed={8} />);
    for (let i = 0; i < 50 && !document.querySelector('.general-card.clickable'); i++) await tick();
    fireEvent.click(document.querySelector<HTMLElement>('.general-card.clickable')!);
    for (let i = 0; i < 50 && !screen.queryByText('刷牌'); i++) await tick();
    const hand = () => [...document.querySelectorAll('.modal .hand .card')].map((c) => c.textContent).join('|');
    expect(document.querySelectorAll('.modal .hand .card')).toHaveLength(4);
    const before = hand();
    fireEvent.click(screen.getByText('刷牌'));
    await tick();
    const after = hand();
    expect(after).not.toBe(before);
    fireEvent.keyDown(window, { key: 'r' });
    await tick();
    expect(hand()).not.toBe(after);
    fireEvent.click(screen.getByText('确定'));
    for (let i = 0; i < 200 && !/第 [1-9]/.test(document.querySelector('.center-info')?.textContent ?? ''); i++) await tick();
    expect(screen.queryByText('刷牌')).toBeNull();
    cleanup();
  });
});
