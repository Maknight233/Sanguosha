import { describe, expect, it } from 'vitest';
import { BasicAI } from '../src/ai/basic';
import { Game, HELP_WEIGHT, HOSTILE_WEIGHT } from '../src/engine/game';
import type { PlayAction, Request } from '../src/engine/types';
import { equip, give, makeGame } from './helpers';

// 身份：0 主公 1 忠臣 2 反贼 3 反贼 4 内奸；距离 0-1=1，0-4=1，0-2=2，0-3=2

const ai = new BasicAI();

async function playDecision(game: Game, seat: number): Promise<PlayAction> {
  const req: Request = { type: 'play', options: game.legalPlays(seat), skills: game.legalSkills(seat) };
  return (await ai.decide(game.view(seat), req)) as PlayAction;
}

describe('基础 AI：出牌', () => {
  it('反贼对攻击范围内的主公出【斩】', async () => {
    const { game } = await makeGame();
    equip(game, 2, 'huanshoudao');
    const z = give(game, 2, 'zhan');
    expect(await playDecision(game, 2)).toEqual({ type: 'use', cardId: z.id, target: 0 });
  });

  it('主公不会对没有敌意的角色出【斩】', async () => {
    const { game } = await makeGame();
    give(game, 0, 'zhan');
    expect(await playDecision(game, 0)).toEqual({ type: 'end' });
  });

  it('主公反击攻击过自己的角色', async () => {
    const { game } = await makeGame();
    const z = give(game, 0, 'zhan');
    game.markHostile(4, 0);
    expect(await playDecision(game, 0)).toEqual({ type: 'use', cardId: z.id, target: 4 });
  });

  it('忠臣攻击攻击过主公的角色', async () => {
    const { game } = await makeGame();
    const z = give(game, 1, 'zhan');
    game.markHostile(2, 0);
    expect(await playDecision(game, 1)).toEqual({ type: 'use', cardId: z.id, target: 2 });
  });

  it('优先装备空槽装备，先用【调兵】', async () => {
    const { game } = await makeGame();
    const horse = give(game, 1, 'qiji');
    give(game, 1, 'tiaobing');
    expect(await playDecision(game, 1)).toEqual({ type: 'use', cardId: horse.id });
  });

  it('只剩 3 人时不装备【神臂弓】', async () => {
    const { game } = await makeGame();
    game.players[2].alive = false;
    game.players[3].alive = false;
    give(game, 1, 'shenbigong');
    expect(await playDecision(game, 1)).toEqual({ type: 'end' });
  });
});

describe('基础 AI：先登', () => {
  const ask: Request = {
    type: 'choose',
    reason: 'xiandeng',
    options: [
      { id: 'yes', label: '' },
      { id: 'no', label: '' },
    ],
  };

  it('敌人都够不着时发动；敌人在攻击范围内且只有 1 张【斩】时不发动', async () => {
    // 2 号反贼：主公距离 2，够不着
    const { game } = await makeGame();
    give(game, 2, 'zhan');
    expect(await ai.decide(game.view(2), ask)).toBe('yes');
    equip(game, 2, 'huanshoudao'); // 射程 2，够得着主公
    expect(await ai.decide(game.view(2), ask)).toBe('no');
    give(game, 2, 'zhan'); // 2 张【斩】：发动以多出一次
    expect(await ai.decide(game.view(2), ask)).toBe('yes');
  });
});

describe('基础 AI：响应', () => {
  it('被【斩】时出【避】', async () => {
    const { game } = await makeGame();
    const bi = give(game, 1, 'bi');
    const r = await ai.decide(game.view(1), { type: 'respond', accept: ['bi'], reason: { kind: 'dodge', source: 2 } });
    expect(r).toBe(bi.id);
  });

  it('忠臣救主公，反贼不救主公', async () => {
    const { game } = await makeGame();
    const y1 = give(game, 1, 'yao');
    give(game, 2, 'yao');
    const req: Request = { type: 'respond', accept: ['yao'], reason: { kind: 'save', dying: 0 } };
    expect(await ai.decide(game.view(1), req)).toBe(y1.id);
    expect(await ai.decide(game.view(2), req)).toBeNull();
  });

  it('内奸平时救主公，最后单挑时不救', async () => {
    const { game } = await makeGame();
    const y = give(game, 4, 'yao');
    const req: Request = { type: 'respond', accept: ['yao'], reason: { kind: 'save', dying: 0 } };
    expect(await ai.decide(game.view(4), req)).toBe(y.id);
    for (const s of [1, 2, 3]) game.players[s].alive = false;
    expect(await ai.decide(game.view(4), req)).toBeNull();
  });

  it('用【识破】保护队友免受有害锦囊', async () => {
    const { game } = await makeGame();
    const sp = give(game, 1, 'shipo');
    const req: Request = {
      type: 'respond',
      accept: ['shipo'],
      reason: { kind: 'shipo', trick: 'jieying', user: 2, target: 0, countering: false },
    };
    expect(await ai.decide(game.view(1), req)).toBe(sp.id);
  });
});

describe('基础 AI：身份排除', () => {
  it('反贼全灭后，忠臣认定剩下的未知角色是内奸', async () => {
    const { game } = await makeGame();
    const z = give(game, 1, 'zhan');
    game.players[2].alive = false;
    game.players[3].alive = false;
    // 只剩 0 主公、1 忠臣、4 内奸；1 到 4 的距离为 2，装备武器以够到
    equip(game, 1, 'huanshoudao');
    expect(await playDecision(game, 1)).toEqual({ type: 'use', cardId: z.id, target: 4 });
  });

  it('内奸：第一个角色阵亡前按兵不动，但会还手', async () => {
    const { game } = await makeGame();
    const z = give(game, 4, 'zhan');
    game.markHostile(1, 0);
    expect(await playDecision(game, 4)).toEqual({ type: 'end' });
    game.markHostile(0, 4); // 主公打了内奸
    expect(await playDecision(game, 4)).toEqual({ type: 'use', cardId: z.id, target: 0 });
  });

  it('内奸：第一个阵亡的是忠臣 → 帮主公打反贼', async () => {
    const { game } = await makeGame();
    give(game, 4, 'zhan');
    equip(game, 4, 'huanshoudao');
    game.players[1].alive = false;
    game.deathOrder.push(1);
    const a = await playDecision(game, 4);
    expect(a.type === 'use' && [2, 3].includes(a.target!)).toBe(true);
  });

  it('内奸平衡：反贼只剩 1 人且忠臣在场 → 攻击疑似忠臣，不打主公和反贼', async () => {
    const { game } = await makeGame(); // 主公体力 5
    const z = give(game, 4, 'zhan');
    equip(game, 4, 'huanshoudao');
    game.players[2].alive = false;
    game.deathOrder.push(2);
    // 看不出谁忠谁反：按兵不动
    expect(await playDecision(game, 4)).toEqual({ type: 'end' });
    // 3 号打过主公 → 1 号更像忠臣（即使 1 号体力更高也打 1 号）
    game.markHostile(3, 0);
    game.players[3].hp = 1;
    expect(await playDecision(game, 4)).toEqual({ type: 'use', cardId: z.id, target: 1 });
  });

  it('内奸平衡：救濒死的最后一个反贼', async () => {
    const { game } = await makeGame();
    const y = give(game, 4, 'yao');
    game.players[2].alive = false;
    game.deathOrder.push(2);
    game.markHostile(3, 0);
    const req: Request = { type: 'respond', accept: ['yao'], reason: { kind: 'save', dying: 3 } };
    expect(await ai.decide(game.view(4), req)).toBe(y.id);
    // 忠臣濒死则不救
    expect(await ai.decide(game.view(4), { ...req, reason: { kind: 'save', dying: 1 } })).toBeNull();
  });

  it('内奸平衡期间，主公只剩 1 点体力时转回帮主公', async () => {
    const { game } = await makeGame();
    const z = give(game, 4, 'zhan');
    equip(game, 4, 'huanshoudao');
    game.players[2].alive = false;
    game.deathOrder.push(2);
    game.markHostile(3, 0);
    game.players[0].hp = 1;
    expect(await playDecision(game, 4)).toEqual({ type: 'use', cardId: z.id, target: 3 });
  });

  it('内奸抢人头：第一个角色阵亡前补刀体力 1 的疑似反贼', async () => {
    const { game } = await makeGame();
    const z = give(game, 4, 'zhan');
    equip(game, 4, 'huanshoudao');
    game.markHostile(2, 0);
    game.markHostile(2, 0); // 2 号反复打主公 → 偏反
    expect(await playDecision(game, 4)).toEqual({ type: 'end' }); // 体力满时不出手
    game.players[2].hp = 1;
    expect(await playDecision(game, 4)).toEqual({ type: 'use', cardId: z.id, target: 2 });
  });

  it('内奸平衡：不抢最后一个反贼的人头', async () => {
    const { game } = await makeGame();
    give(game, 4, 'zhan');
    equip(game, 4, 'huanshoudao');
    game.players[2].alive = false;
    game.deathOrder.push(2);
    game.markHostile(3, 0);
    game.players[3].hp = 1;
    const a = await playDecision(game, 4);
    expect(a.type === 'use' && a.target === 3).toBe(false);
  });

  it('内奸帮反贼期间，忠臣也阵亡后转回帮主公', async () => {
    const { game } = await makeGame();
    const z = give(game, 4, 'zhan');
    game.players[2].alive = false;
    game.players[1].alive = false;
    game.deathOrder.push(2, 1);
    // 只剩主公、3 号（可推出是反贼）、内奸：攻击反贼而不是主公
    expect(await playDecision(game, 4)).toEqual({ type: 'use', cardId: z.id, target: 3 });
  });

  it('内奸帮反贼时仍会救濒死的主公', async () => {
    const { game } = await makeGame();
    const y = give(game, 4, 'yao');
    game.players[2].alive = false;
    game.deathOrder.push(2);
    const req: Request = { type: 'respond', accept: ['yao'], reason: { kind: 'save', dying: 0 } };
    expect(await ai.decide(game.view(4), req)).toBe(y.id);
  });

  it('反贼优先集火主公', async () => {
    const { game } = await makeGame();
    equip(game, 2, 'shenbigong');
    const z = give(game, 2, 'zhan');
    game.markHostile(4, 2); // 内奸打过反贼，但主公优先
    game.players[4].hp = 1;
    expect(await playDecision(game, 2)).toEqual({ type: 'use', cardId: z.id, target: 0 });
  });

  it('只剩主公时内奸攻击主公', async () => {
    const { game } = await makeGame();
    const z = give(game, 4, 'zhan');
    for (const s of [1, 2, 3]) game.players[s].alive = false;
    expect(await playDecision(game, 4)).toEqual({ type: 'use', cardId: z.id, target: 0 });
  });
});

describe('基础 AI：身份推理', () => {
  const save = (dying: number): Request => ({ type: 'respond', accept: ['yao'], reason: { kind: 'save', dying } });

  it('忠臣打过攻击主公的人后，主公把他当队友（会救）', async () => {
    const { game } = await makeGame();
    const y = give(game, 0, 'yao');
    expect(await ai.decide(game.view(0), save(1))).toBeNull(); // 还看不出来
    game.markHostile(2, 0); // 2 号打主公 → 偏反
    game.markHostile(1, 2); // 1 号打偏反的 2 号 → 偏忠
    expect(await ai.decide(game.view(0), save(1))).toBe(y.id);
  });

  it('救过主公的人，忠臣认作队友', async () => {
    const { game } = await makeGame();
    const y = give(game, 1, 'yao');
    expect(await ai.decide(game.view(1), save(4))).toBeNull();
    game.markHelp(4, 0, HELP_WEIGHT.save);
    expect(await ai.decide(game.view(1), save(4))).toBe(y.id);
  });

  it('立场明确的人误伤一次，不会被直接当成敌人', async () => {
    const { game } = await makeGame();
    const z = give(game, 0, 'zhan');
    game.markHelp(1, 0, HELP_WEIGHT.save); // 1 号救过主公
    game.markHostile(1, 0, HOSTILE_WEIGHT.steal); // 后来对主公用了一次【劫营】
    expect(await playDecision(game, 0)).toEqual({ type: 'end' });
    // 没有好记录的人做同样的事，主公会还手
    game.markHostile(4, 0, HOSTILE_WEIGHT.steal);
    expect(await playDecision(game, 0)).toEqual({ type: 'use', cardId: z.id, target: 4 });
  });

  it('反贼把替主公挡锦囊的人当敌人', async () => {
    const { game } = await makeGame();
    // 主公不在 2 号攻击范围内；1 号、3 号都在
    const z = give(game, 2, 'zhan');
    game.markHelp(3, 0, HELP_WEIGHT.cover);
    expect(await playDecision(game, 2)).toEqual({ type: 'use', cardId: z.id, target: 3 });
  });

  it('连锁推理：救了打主公的人，也被认作反贼一伙', async () => {
    const { game } = await makeGame();
    give(game, 1, 'yao');
    const z = give(game, 1, 'zhan');
    equip(game, 1, 'huanshoudao');
    game.markHostile(3, 0); // 3 号打主公 → 偏反
    game.markHelp(4, 3, HELP_WEIGHT.save); // 4 号救了 3 号 → 偏反
    expect(await ai.decide(game.view(1), save(4))).toBeNull();
    game.players[3].hp = 4;
    game.players[4].hp = 1; // 体力最低，若被认作敌人就会被优先攻击
    expect(await playDecision(game, 1)).toEqual({ type: 'use', cardId: z.id, target: 4 });
  });
});

describe('引擎：公开行为记录', () => {
  it('【识破】替别人挡掉有害锦囊记为帮助', async () => {
    const { game, ctrls } = await makeGame();
    const sp = give(game, 1, 'shipo');
    give(game, 0, 'zhan');
    ctrls[1].handler = (_v, req) => (req.type === 'respond' ? sp.id : undefined);
    const card = give(game, 2, 'jieying');
    game.takeFromHand(game.players[2], card.id);
    await game.useCard(game.players[2], card, 0);
    expect(game.hostility[2][0]).toBe(HOSTILE_WEIGHT.steal);
    expect(game.help[1][0]).toBe(HELP_WEIGHT.cover);
  });

  it('濒死时对别人用【药】记为帮助', async () => {
    const { game, ctrls } = await makeGame();
    const y = give(game, 4, 'yao');
    ctrls[4].handler = (_v, req) => (req.type === 'respond' ? y.id : undefined);
    game.players[0].hp = 1;
    await game.damage(2, 0, 1);
    expect(game.players[0].hp).toBe(1);
    expect(game.help[4][0]).toBe(HELP_WEIGHT.save);
  });
});

describe('基础 AI：完整对局', () => {
  it('100 局 AI 对战全部正常结束', async () => {
    for (let seed = 1; seed <= 100; seed++) {
      const game = new Game({ controllers: [0, 1, 2, 3, 4].map(() => new BasicAI()), seed, maxTurns: 5000 });
      const winner = await game.start();
      expect(game.checkVictory()).toBe(winner);
    }
  }, 60000);
});
