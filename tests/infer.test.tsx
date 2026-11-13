// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { aiOpinions, BasicAI, observerOpinions, observerView } from '../src/ai/basic';
import { Game } from '../src/engine/game';
import { RecordingController, RECORD_VERSION, replay, viewFromSnapshot, type Answer, type GameRecord } from '../src/engine/record';
import type { Role } from '../src/engine/types';
import { GameScreen } from '../src/ui/GameScreen';
import { readingAt, ReplayScreen } from '../src/ui/ReplayScreen';
import { loadInfer, saveInfer } from '../src/ui/storage';
import { makeGame } from './helpers';

afterEach(cleanup);

// 身份：0 主公 1 忠臣 2 反贼 3 反贼 4 内奸
describe('读局：旁观者推测', () => {
  it('只用公开信息：观看者自己的身份不影响结果', async () => {
    const results = [];
    for (const roles of [
      ['lord', 'loyalist', 'rebel', 'rebel', 'renegade'],
      ['lord', 'rebel', 'loyalist', 'rebel', 'renegade'],
    ] as Role[][]) {
      const { game } = await makeGame(undefined, roles);
      game.markHostile(1, 0); // 1 号打主公
      game.markHelp(2, 0, 1); // 2 号帮主公
      // 从 1 号自己的视角看（1 号知道自己的身份）
      results.push(observerOpinions(game.view(1)));
    }
    expect(results[0]).toEqual(results[1]);
    const ops = results[0];
    expect(ops[0]).toBeNull(); // 主公身份公开
    expect(ops[1]!.verdict).toBe('rebel');
    expect(ops[2]!.verdict).toBe('loyal');
    expect(ops[3]!.verdict).toBe('unclear');
  });

  it('旁观者视角隐藏观看者的身份与手牌（主公除外）', async () => {
    const { game } = await makeGame();
    expect(observerView(game.view(2)).players[2].role).toBeNull();
    expect(observerView(game.view(2)).players[2].hand).toBeNull();
    expect(observerView(game.view(0)).players[0].role).toBe('lord');
  });

  it('AI 视角：给出敌友；内奸给出策略模式', async () => {
    const { game } = await makeGame();
    game.markHostile(2, 0);
    const lordView = aiOpinions(game.view(0));
    expect(lordView.relations[2]).toBe('enemy');
    expect(lordView.opinions[0]).toBeNull();
    expect(lordView.mode).toBeNull();
    expect(aiOpinions(game.view(4)).mode).toBe('wait');
  });
});

async function recorded(seed: number): Promise<GameRecord> {
  const names = ['你', '电脑一', '电脑二', '电脑三', '电脑四'];
  const answers: Answer[] = [];
  const game = new Game({ controllers: names.map((_, s) => new RecordingController(new BasicAI(), s, answers)), names, seed });
  const winner = await game.start();
  const me = game.players[0];
  return {
    version: RECORD_VERSION,
    id: `i-${seed}`,
    date: seed,
    seed,
    names,
    human: 0,
    answers,
    winner,
    turns: game.turn,
    role: me.role,
    general: me.general,
    won: false,
    logLength: game.log.length,
  };
}

describe('读局：回放', () => {
  it('快照可重建任意座位的视角，推测与原局当时一致', async () => {
    const rec = await recorded(5);
    const data = await replay(rec);
    const snap = data.snapshots[Math.floor(data.snapshots.length / 2)];
    const v = viewFromSnapshot(snap, 3);
    expect(v.players[3].hand).not.toBeNull();
    expect(v.players.filter((p) => p.seat !== 3 && p.hand !== null)).toHaveLength(0);
    expect(readingAt(snap, 'off')).toBeNull();
    expect(readingAt(snap, 'observer')!.relations).toBeNull();
    const alive = snap.players.find((p) => p.alive && p.role !== 'lord')!;
    expect(readingAt(snap, alive.seat)!.relations![alive.seat]).toBeNull();
  });

  it('界面：切换视角后座位上出现推测', async () => {
    const rec = await recorded(5);
    render(<ReplayScreen record={rec} onBack={() => {}} />);
    const tick = () => act(() => new Promise((r) => setTimeout(r, 0)));
    for (let i = 0; i < 50 && !screen.queryByLabelText('读局视角'); i++) await tick();
    fireEvent.keyDown(window, { key: 'PageDown' });
    fireEvent.keyDown(window, { key: 'PageDown' });
    expect(document.querySelectorAll('.infer-row')).toHaveLength(0);
    fireEvent.change(screen.getByLabelText('读局视角'), { target: { value: '1' } });
    expect(document.querySelectorAll('.rel-enemy, .rel-friend, .rel-neutral').length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText('读局视角'), { target: { value: 'observer' } });
    expect(document.querySelectorAll('.infer-row').length).toBeGreaterThan(0);
    expect(document.querySelectorAll('.rel-enemy, .rel-friend, .rel-neutral')).toHaveLength(0);
  }, 30000);
});

describe('读局：对局界面', () => {
  it('按 I 开关，状态会记住；默认关闭', async () => {
    saveInfer(false);
    render(<GameScreen onExit={() => {}} aiDelay={0} seed={5} />);
    const tick = () => act(() => new Promise((r) => setTimeout(r, 0)));
    for (let i = 0; i < 50 && !document.querySelector('.general-card.clickable'); i++) await tick();
    fireEvent.click(document.querySelector<HTMLElement>('.general-card.clickable')!);
    for (let i = 0; i < 50 && !screen.queryByText('刷牌'); i++) await tick();
    fireEvent.keyDown(window, { key: ' ' });
    for (let i = 0; i < 200 && !/第 [1-9]/.test(document.querySelector('.center-info')?.textContent ?? ''); i++) await tick();
    expect(document.querySelectorAll('.infer-row')).toHaveLength(0);
    fireEvent.keyDown(window, { key: 'i' });
    await tick();
    expect(document.querySelectorAll('.infer-row').length).toBeGreaterThan(0);
    expect(loadInfer()).toBe(true);
    fireEvent.click(screen.getByText('读局'));
    await tick();
    expect(document.querySelectorAll('.infer-row')).toHaveLength(0);
    expect(loadInfer()).toBe(false);
  }, 30000);
});
