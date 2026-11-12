import { describe, expect, it } from 'vitest';
import { aiOpinions } from '../src/ai/basic';
import { Game, HELP_WEIGHT, ROLE_TABLE } from '../src/engine/game';
import type { Role } from '../src/engine/types';
import { Scripted } from './helpers';

// 7 人局：0 主公 1 忠臣 2 忠臣 3 反贼 4 反贼 5 反贼 6 内奸
const GENERALS7 = ['caocao', 'guojia', 'zhangliao', 'liubei', 'zhaoyun', 'sunquan', 'ganning'];

async function game7(roles: Role[] = ROLE_TABLE[7]) {
  const game = new Game({ controllers: roles.map(() => new Scripted()), seed: 42, roles, generals: GENERALS7, disableSkills: true });
  await game.setup();
  return game;
}
const kill = (game: Game, ...seats: number[]) => {
  for (const s of seats) {
    game.players[s].alive = false;
    game.deathOrder.push(s);
  }
};
const relation = (game: Game, me: number, seat: number) => aiOpinions(game.view(me)).relations[seat];

describe('僵局：按人数排除', () => {
  /** 剩主公、两名忠臣和一名从不动手的反贼（3 号）；两名忠臣都救过主公 */
  async function lastRebelHiding() {
    const game = await game7();
    kill(game, 4, 5, 6);
    game.markHelp(1, 0, HELP_WEIGHT.save);
    game.markHelp(2, 0, HELP_WEIGHT.save);
    return game;
  }

  it('没有僵住时，不动手的人仍是中立', async () => {
    const game = await lastRebelHiding();
    expect(relation(game, 0, 3)).toBe('neutral');
    expect(relation(game, 1, 3)).toBe('neutral');
  });

  it('两轮没人受伤后，主公和忠臣都把倾向分最低的未知者当敌人，队友不受影响', async () => {
    const game = await lastRebelHiding();
    game.turn = 40;
    game.lastDamageTurn = 40 - 4 * 2;
    for (const me of [0, 1, 2]) expect(relation(game, me, 3)).toBe('enemy');
    expect(relation(game, 0, 1)).toBe('friend');
    expect(relation(game, 1, 2)).toBe('friend');
  });

  it('动过手之后即使刚有人受伤也继续当敌人', async () => {
    const game = await lastRebelHiding();
    game.turn = 40;
    game.lastDamageTurn = 40;
    game.markHostile(0, 3);
    expect(relation(game, 0, 3)).toBe('enemy');
    expect(relation(game, 1, 3)).toBe('enemy');
  });

  it('分不出高低时先观望，僵持四轮后不再等', async () => {
    const game = await game7();
    kill(game, 4, 5, 6);
    game.turn = 40;
    game.lastDamageTurn = 40 - 4 * 2;
    expect(relation(game, 0, 3)).toBe('neutral');
    game.lastDamageTurn = 40 - 4 * 4;
    expect(relation(game, 0, 3)).toBe('enemy');
  });

  it('久僵时连「像忠臣」的潜伏者也会被怀疑', async () => {
    const game = await lastRebelHiding();
    game.markHelp(3, 0, HELP_WEIGHT.save);
    game.turn = 40;
    game.lastDamageTurn = 40 - 4 * 2;
    expect(relation(game, 1, 3)).toBe('friend');
    game.lastDamageTurn = 40 - 4 * 4;
    expect(relation(game, 1, 3)).toBe('enemy');
  });

  it('反贼全灭后，已亮明身份的内奸是主公方的敌人', async () => {
    const game = await game7();
    kill(game, 3, 4);
    game.revealed.add(6);
    expect(relation(game, 0, 6)).toBe('neutral'); // 还有反贼（5 号）活着
    kill(game, 5);
    expect(relation(game, 0, 6)).toBe('enemy');
    expect(relation(game, 1, 6)).toBe('enemy');
  });

  it('GameView.quietTurns 为距上次伤害的回合数', async () => {
    const game = await game7();
    game.turn = 10;
    game.lastDamageTurn = 7;
    expect(game.view(0).quietTurns).toBe(3);
  });
});
