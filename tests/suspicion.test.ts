import { afterEach, describe, expect, it } from 'vitest';
import { BasicAI, inferOf, LEAN_THRESHOLD, SUSPICION_TUNING } from '../src/ai/basic';
import { HELP_WEIGHT } from '../src/engine/game';
import type { Request } from '../src/engine/types';
import { give, makeGame } from './helpers';

// 身份：0 主公 1 忠臣 2 反贼 3 反贼 4 内奸

const ai = new BasicAI();
const save = (dying: number): Request => ({ type: 'respond', accept: ['yao'], reason: { kind: 'save', dying } });

afterEach(() => Object.assign(SUSPICION_TUNING, { enabled: true, threshold: 1.0 }));

/** 4 号两面行为：救主公、打疑似反贼 2 号，同时也打疑似忠臣 1 号 */
async function twoSided() {
  const { game } = await makeGame();
  game.markHostile(2, 0); // 2 号打主公 → 偏反
  game.markHelp(1, 0, HELP_WEIGHT.save); // 1 号救主公 → 偏忠
  game.markHelp(4, 0, HELP_WEIGHT.save); // 4 号救主公（帮主公方）
  game.markHostile(4, 2); // 打偏反的人（帮主公方）
  game.markHostile(4, 1); // 打偏忠的人两次（帮反贼方；未知者的倾向分到不了 ±1，一次略低于阈值）
  game.markHostile(4, 1);
  return game;
}

describe('内奸嫌疑分', () => {
  it('两边都做过的人被认作疑似内奸，只帮一边的人不会', async () => {
    const game = await twoSided();
    const r = inferOf(game.view(0), 4);
    expect(r.suspicion).toBeGreaterThanOrEqual(1);
    expect(r.suspected).toBe(true);
    expect(inferOf(game.view(0), 1).suspicion).toBe(0);
    expect(inferOf(game.view(0), 2).suspicion).toBe(0);
  });

  it('疑似内奸即使偏忠，主公也不再救他；关闭嫌疑分时会救', async () => {
    const game = await twoSided();
    give(game, 0, 'yao');
    expect(inferOf(game.view(0), 4).lean).toBeGreaterThan(LEAN_THRESHOLD);
    expect(await ai.decide(game.view(0), save(4))).toBeNull();
    SUSPICION_TUNING.enabled = false;
    expect(await ai.decide(game.view(0), save(4))).not.toBeNull();
  });

  it('内奸已阵亡（身份排除）时嫌疑分为 0', async () => {
    const game = await twoSided();
    // 把内奸换成 3 号阵亡，使未知者里不再有内奸
    game.players[3].alive = false;
    game.players[3].role = 'renegade';
    game.players[4].role = 'rebel';
    expect(inferOf(game.view(0), 4).suspicion).toBe(0);
  });

  it('只看嫌疑分超过阈值', async () => {
    const game = await twoSided();
    SUSPICION_TUNING.threshold = 99;
    expect(inferOf(game.view(0), 4).suspected).toBe(false);
  });
});
