import { describe, expect, it } from 'vitest';
import type { Controller, GameView, Request, Response } from '../src/engine/types';
import { PacedController, PauseGate } from '../src/ui/controllers';
import { filterLog } from '../src/ui/inspect';

describe('暂停闸门', () => {
  it('暂停时 AI 不做决策，恢复后继续', async () => {
    const gate = new PauseGate();
    let calls = 0;
    const inner: Controller = {
      async decide<R extends Request>(): Promise<Response<R>> {
        calls++;
        return { type: 'end' } as Response<R>;
      },
    };
    const ai = new PacedController(inner, () => 0, gate);
    gate.pause();
    let done = false;
    const p = ai.decide({} as GameView, { type: 'play', options: [], skills: [] }).then(() => (done = true));
    await new Promise((r) => setTimeout(r, 20));
    expect(calls).toBe(0);
    expect(done).toBe(false);
    gate.resume();
    await p;
    expect(calls).toBe(1);
  });

  it('未暂停时立即通过', async () => {
    const gate = new PauseGate();
    await expect(gate.wait()).resolves.toBeUndefined();
  });
});

describe('日志筛选', () => {
  const card = { id: 1, key: 'zhan', suit: 'spade' as const, rank: 1 };
  const log = [
    { turn: 1, text: '—— 第 1 回合：你（曹操） ——', event: { type: 'turn' as const, seat: 0 } },
    { turn: 1, text: '你（曹操） 对 电脑一 使用了【斩】', event: { type: 'use' as const, from: 0, to: [1], cards: [card] } },
    { turn: 2, text: '—— 第 2 回合：电脑一 ——', event: { type: 'turn' as const, seat: 1 } },
    { turn: 2, text: '电脑一 对 电脑二 使用了【斩】', event: { type: 'use' as const, from: 1, to: [2], cards: [card] } },
    { turn: 3, text: '—— 第 3 回合：电脑二 ——', event: { type: 'turn' as const, seat: 2 } },
    { turn: 3, text: '电脑二 对 电脑三 造成 1 点伤害', event: { type: 'damage' as const, seat: 3, amount: 1, from: 2 } },
    { turn: 3, text: '电脑三 回复 1 点体力', event: { type: 'recover' as const, seat: 0, amount: 1 } },
  ];

  it('全部', () => expect(filterLog(log, 'all', 0, 3)).toHaveLength(log.length));
  it('本回合', () => expect(filterLog(log, 'turn', 0, 3).map((e) => e.turn)).toEqual([3, 3, 3]));
  it('与我相关：只保留有相关条目的回合标题', () => {
    expect(filterLog(log, 'mine', 0, 3).map((e) => e.text)).toEqual([log[0].text, log[1].text, log[4].text, log[6].text]);
  });
});
