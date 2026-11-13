import { describe, expect, it } from 'vitest';
import { BasicAI } from '../src/ai/basic';
import { Game, roleLabel, winnerLabel } from '../src/engine/game';
import type { Controller, Request } from '../src/engine/types';
import { Scripted } from './helpers';

const team = (role: string | null) => (role === 'rebel' ? 'B' : 'A');

describe('2v2 组队', () => {
  it('座位交错（甲乙甲乙），主公为先手，没有体力加成，身份全部公开', async () => {
    for (let seed = 1; seed <= 20; seed++) {
      const game = new Game({ controllers: [0, 1, 2, 3].map(() => new Scripted()), seed });
      await game.setup();
      expect(game.team).toBe(true);
      const roles = game.players.map((p) => p.role);
      for (let s = 0; s < 4; s++) expect(team(roles[s])).not.toBe(team(roles[(s + 1) % 4]));
      expect(game.players[game.current].role).toBe('lord');
      for (const p of game.players) expect(p.maxHp).toBeLessThanOrEqual(5);
      for (let s = 0; s < 4; s++) expect(game.view(s).players.every((p) => p.role !== null)).toBe(true);
    }
  });

  it('选将：从先手开始按座位顺序，每人 3 选 1，后选的人能看到前面的选择', async () => {
    const ctrls = [0, 1, 2, 3].map(() => new Scripted());
    const game = new Game({ controllers: ctrls, seed: 9 });
    await game.setup();
    const first = game.current;
    for (let i = 0; i < 4; i++) {
      const seat = (first + i) % 4;
      const req = ctrls[seat].requests.find((r) => r.type === 'chooseGeneral') as Extract<Request, { type: 'chooseGeneral' }>;
      expect(req.options).toHaveLength(3);
    }
    // 最后一个选将的人看到其他三人的武将
    const last = (first + 3) % 4;
    expect(game.players.filter((p) => p.seat !== last).every((p) => p.general)).toBe(true);
  });

  it('打死对方两人才算赢；击杀没有奖惩', async () => {
    const game = new Game({ controllers: [0, 1, 2, 3].map(() => new Scripted()), seed: 4 });
    await game.setup();
    const rebels = game.players.filter((p) => p.role === 'rebel');
    const killer = game.players.find((p) => p.role === 'lord')!;
    const hand = killer.hand.length;
    await game.kill(rebels[0].seat, killer.seat);
    expect(game.checkVictory()).toBeNull();
    expect(killer.hand.length).toBe(hand);
    await expect(game.kill(rebels[1].seat, killer.seat)).rejects.toMatchObject({ winner: 'lord' });
  });

  it('界面显示甲队 / 乙队', () => {
    expect(roleLabel('lord', 4)).toBe('甲队');
    expect(roleLabel('loyalist', 4)).toBe('甲队');
    expect(roleLabel('rebel', 4)).toBe('乙队');
    expect(winnerLabel('lord', 4)).toBe('甲队');
  });

  it('AI 对局都能正常结束，牌数守恒', async () => {
    for (let seed = 1; seed <= 20; seed++) {
      const game = new Game({ controllers: [0, 1, 2, 3].map(() => new BasicAI()), seed, maxTurns: 1000 });
      const winner = await game.start();
      expect(['lord', 'rebel', 'draw']).toContain(winner);
      expect(game.totalCards()).toBe(89);
    }
  });
});

describe('2v2 认输', () => {
  it('本队有人阵亡后才能认输；认输在下一次回答后生效，判对方获胜，记录可以回放', async () => {
    const { RecordingController, replay, RECORD_VERSION } = await import('../src/engine/record');
    const answers: import('../src/engine/record').Answer[] = [];
    let game!: Game;
    // 0 号位：本队第一次有人阵亡后的第一次询问时认输
    const resigner = new BasicAI();
    const wrapped: Controller = {
      decide: (view, req) => {
        if (game.canResign(0)) game.resign(0);
        return resigner.decide(view, req);
      },
    };
    let seed = 0;
    let winner: string | undefined;
    for (seed = 1; seed < 50 && !game?.resigned; seed++) {
      answers.length = 0;
      const ctrls = [wrapped, new BasicAI(), new BasicAI(), new BasicAI()].map((c, s) => new RecordingController(c, s, answers));
      game = new Game({ controllers: ctrls, seed, maxTurns: 1000 });
      expect(game.canResign(0)).toBe(false);
      winner = await game.start();
    }
    expect(game.resigned?.seat).toBe(0);
    expect(winner).toBe(game.players[0].role === 'rebel' ? 'lord' : 'rebel');
    expect(game.resigned!.at).toBe(answers.length);
    expect(game.log.at(-2)!.text).toContain('认输');
    expect(game.log.at(-1)!.text).toContain(game.players[0].role === 'rebel' ? '甲队获胜' : '乙队获胜');
    const rec = {
      version: RECORD_VERSION, id: 'x', date: 1, seed: seed - 1, names: game.players.map((p) => p.name), human: 0, answers: [...answers],
      winner: winner!, turns: game.turn, role: game.players[0].role, general: game.players[0].general, won: false, logLength: game.log.length, resign: game.resigned!,
    } as import('../src/engine/record').GameRecord;
    const res = await replay(rec);
    expect(res.error).toBeNull();
  });
});
