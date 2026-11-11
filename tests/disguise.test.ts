import { describe, expect, it } from 'vitest';
import { BasicAI, DISGUISE_TUNING, aiOpinions } from '../src/ai/basic';
import { Game } from '../src/engine/game';
import type { Role } from '../src/engine/types';
import { makeGame } from './helpers';

const R: Role[] = ['lord', 'loyalist', 'rebel', 'rebel', 'renegade'];

/** 找一个两名反贼分别为潜伏型 / 普通型的武将组合 */
async function mixedGame() {
  for (const generals of [
    ['caocao', 'guojia', 'zhangliao', 'liubei', 'zhaoyun'],
    ['caocao', 'guojia', 'lvbu', 'diaochan', 'zhaoyun'],
    ['caocao', 'guojia', 'guanyu', 'sunquan', 'zhaoyun'],
    ['caocao', 'guojia', 'zhouyu', 'huatuo', 'zhaoyun'],
    ['caocao', 'guojia', 'ganning', 'luxun', 'zhaoyun'],
  ]) {
    const { game } = await makeGame(undefined, R, { generals });
    game.turn = 1;
    const lurk = [2, 3].map((s) => aiOpinions(game.view(s)).relations[0] === 'neutral');
    if (lurk[0] !== lurk[1]) return { game, lurker: lurk[0] ? 2 : 3, normal: lurk[0] ? 3 : 2 };
  }
  throw new Error('没找到');
}

describe('AI 伪装：反贼潜伏', () => {
  it('潜伏型反贼开局不把主公当敌人，普通型照常', async () => {
    const { game, lurker, normal } = await mixedGame();
    expect(aiOpinions(game.view(lurker)).relations[0]).toBe('neutral');
    expect(aiOpinions(game.view(normal)).relations[0]).toBe('enemy');
  });

  it('潜伏期间被打会还击', async () => {
    const { game, lurker } = await mixedGame();
    game.markHostile(1, lurker);
    expect(aiOpinions(game.view(lurker)).relations[1]).toBe('enemy');
    expect(aiOpinions(game.view(lurker)).relations[0]).toBe('neutral');
  });

  it('有人阵亡、主公体力 ≤2、自己体力 ≤1 或过了第 1 轮就结束潜伏', async () => {
    const { game, lurker } = await mixedGame();
    const rel = () => aiOpinions(game.view(lurker)).relations[0];
    game.turn = 6;
    expect(rel()).toBe('enemy');
    game.turn = 1;
    game.players[0].hp = 2;
    expect(rel()).toBe('enemy');
    game.players[0].hp = 5;
    game.players[lurker].hp = 1;
    expect(rel()).toBe('enemy');
    game.players[lurker].hp = 4;
    game.players[1].alive = false;
    game.deathOrder.push(1);
    expect(rel()).toBe('enemy');
  });

  it('关闭伪装时不潜伏', async () => {
    const { game, lurker } = await mixedGame();
    DISGUISE_TUNING.enabled = false;
    try {
      expect(aiOpinions(game.view(lurker)).relations[0]).toBe('enemy');
    } finally {
      DISGUISE_TUNING.enabled = true;
    }
  });

  it('开启伪装的 AI 对局都能正常结束', async () => {
    for (let seed = 1; seed <= 20; seed++) {
      const game = new Game({ controllers: R.map(() => new BasicAI()), seed, maxTurns: 500 });
      await game.start();
    }
  });
});
