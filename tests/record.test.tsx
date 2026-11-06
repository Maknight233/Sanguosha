// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BasicAI } from '../src/ai/basic';
import { Game } from '../src/engine/game';
import { RECORD_VERSION, RecordingController, replay, type Answer, type GameRecord } from '../src/engine/record';
import { App } from '../src/ui/App';
import { jumpTurn, ReplayScreen } from '../src/ui/ReplayScreen';
import { clearStats, loadRecords, loadStats, MAX_RECORDS, saveGame } from '../src/ui/storage';

const NAMES = ['你', '电脑一', '电脑二', '电脑三', '电脑四'];

/** 5 个 AI 打一局并记录，返回原局与记录 */
async function recordedGame(seed: number): Promise<{ game: Game; rec: GameRecord }> {
  const answers: Answer[] = [];
  const game = new Game({
    controllers: NAMES.map((_, seat) => new RecordingController(new BasicAI(), seat, answers)),
    names: NAMES,
    seed,
  });
  const winner = await game.start();
  const me = game.players[0];
  const rec: GameRecord = {
    version: RECORD_VERSION,
    id: `t-${seed}`,
    date: seed,
    seed,
    names: NAMES,
    human: 0,
    answers,
    winner,
    turns: game.turn,
    role: me.role,
    general: me.general,
    won: (me.role === 'loyalist' ? 'lord' : me.role) === winner,
    logLength: game.log.length,
  };
  return { game, rec };
}

afterEach(cleanup);
beforeEach(() => localStorage.clear());

describe('对局记录与回放', () => {
  it('用种子 + 回答重跑，日志与结局完全一致', async () => {
    for (const seed of [3, 14, 159]) {
      const { game, rec } = await recordedGame(seed);
      // 记录可以存成 JSON 再读回
      const r = await replay(JSON.parse(JSON.stringify(rec)));
      expect(r.error).toBeNull();
      expect(r.log.map((e) => e.text)).toEqual(game.log.map((e) => e.text));
      expect(r.snapshots).toHaveLength(game.log.length);
      const last = r.snapshots.at(-1)!;
      expect(last.players.map((p) => [p.hp, p.alive, p.role, p.hand.length])).toEqual(
        game.players.map((p) => [p.hp, p.alive, p.role, p.hand.length]),
      );
    }
  });

  it('局面快照是当时的状态，不随后续变化', async () => {
    const { rec } = await recordedGame(7);
    const r = await replay(rec);
    const firstTurn = r.log.findIndex((e) => e.event?.type === 'turn');
    const hpAtStart = r.snapshots[firstTurn].players.map((p) => p.hp);
    expect(hpAtStart.every((hp, i) => hp === r.snapshots[firstTurn].players[i].maxHp)).toBe(true);
    expect(r.snapshots.at(-1)!.players.some((p) => !p.alive)).toBe(true);
  });

  it('记录对不上（规则或记录被改动）时给出提示', async () => {
    const { rec } = await recordedGame(5);
    const broken = { ...rec, answers: rec.answers.slice(0, 30) };
    const r = await replay(broken);
    expect(r.error).toMatch(/不兼容/);
    expect(r.snapshots.length).toBeGreaterThan(0);
    const swapped = { ...rec, answers: rec.answers.map((a, i) => (i === 10 ? { ...a, seat: (a.seat + 1) % 5 } : a)) };
    expect((await replay(swapped)).error).toMatch(/不兼容/);
  });

  it('按回合跳转', () => {
    const starts = [3, 10, 20];
    expect(jumpTurn(starts, 0, 1)).toBe(3);
    expect(jumpTurn(starts, 10, 1)).toBe(20);
    expect(jumpTurn(starts, 20, 1)).toBe(20);
    expect(jumpTurn(starts, 15, -1)).toBe(10);
    expect(jumpTurn(starts, 10, -1)).toBe(3);
    expect(jumpTurn(starts, 2, -1)).toBe(0);
  });
});

describe('本地存储', () => {
  const rec = (i: number, over: Partial<GameRecord> = {}): GameRecord =>
    ({ id: `r${i}`, date: i, role: 'rebel', general: 'liubei', won: i % 2 === 0, answers: [], ...over }) as unknown as GameRecord;

  it(`只保留最近 ${MAX_RECORDS} 局，最新的在前`, () => {
    for (let i = 1; i <= 25; i++) saveGame(rec(i));
    const list = loadRecords();
    expect(list).toHaveLength(MAX_RECORDS);
    expect(list[0].id).toBe('r25');
    expect(list.at(-1)!.id).toBe('r6');
  });

  it('战绩累计不受 20 局限制，可清空', () => {
    for (let i = 1; i <= 25; i++) saveGame(rec(i, i > 20 ? { role: 'lord', general: 'caocao' } : {}));
    const s = loadStats();
    expect(s.total).toEqual({ games: 25, wins: 12 });
    expect(s.byRole.rebel).toEqual({ games: 20, wins: 10 });
    expect(s.byRole.lord).toEqual({ games: 5, wins: 2 });
    expect(s.byGeneral.caocao.games).toBe(5);
    clearStats();
    expect(loadStats().total.games).toBe(0);
    expect(loadRecords()).toHaveLength(MAX_RECORDS); // 清空战绩不影响对局记录
  });
});

describe('回放界面', () => {
  const tick = () => act(() => new Promise((r) => setTimeout(r, 0)));

  it('单步前进、后退、按回合跳转，身份与手牌全部可见', async () => {
    const { rec } = await recordedGame(21);
    render(<ReplayScreen record={rec} onBack={() => {}} />);
    for (let i = 0; i < 50 && !screen.queryByText(/第 1\/\d+ 步/); i++) await tick();
    expect(screen.getByText(/第 1\/\d+ 步/)).toBeTruthy();
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByText(/第 3\/\d+ 步/)).toBeTruthy();
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(screen.getByText(/第 2\/\d+ 步/)).toBeTruthy();
    const current = () => document.querySelector('.log-current')!.textContent!;
    fireEvent.keyDown(window, { key: 'Home' });
    fireEvent.keyDown(window, { key: 'PageDown' });
    expect(current()).toMatch(/^—— 第 1 回合/);
    fireEvent.keyDown(window, { key: 'PageDown' });
    expect(current()).toMatch(/^—— 第 2 回合/);
    fireEvent.keyDown(window, { key: 'PageUp' });
    expect(current()).toMatch(/^—— 第 1 回合/);
    // 所有身份公开，没有「？」
    expect([...document.querySelectorAll('.role-badge')].some((b) => b.textContent === '？')).toBe(false);
    expect(document.querySelectorAll('.replay-hand .card').length).toBeGreaterThan(0);
    fireEvent.keyDown(window, { key: 'End' });
    expect(document.querySelector('.log-current')!.textContent).toMatch(/游戏结束/);
    // 点击日志跳转
    fireEvent.click(document.querySelectorAll('.log-entry')[0]);
    expect(screen.getByText(/第 1\/\d+ 步/)).toBeTruthy();
  });

  it('主菜单 → 对局记录 → 回放 → 返回', async () => {
    const { rec } = await recordedGame(33);
    saveGame(rec);
    render(<App />);
    fireEvent.click(screen.getByText('对局记录'));
    expect(document.querySelector('.records')!.textContent).toContain('共 1 局');
    fireEvent.click(screen.getByText('回放'));
    for (let i = 0; i < 50 && !screen.queryByText(/第 1\/\d+ 步/); i++) await tick();
    expect(screen.getByText(/第 1\/\d+ 步/)).toBeTruthy();
    fireEvent.click(screen.getByText('返回'));
    expect(screen.getByText('最近对局（最多 20 局）')).toBeTruthy();
  });
});
