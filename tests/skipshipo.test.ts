import { describe, expect, it } from 'vitest';
import type { GameView, Request } from '../src/engine/types';
import { HumanController } from '../src/ui/controllers';
import { give, makeGame, ROLES, Scripted } from './helpers';

const view = {} as GameView;
const shipo = (trickId: number, countering = false): Request => ({
  type: 'respond',
  accept: ['shipo'],
  reason: { kind: 'shipo', trick: 'xiwen', user: 2, target: 1, countering, trickId, group: true },
});

describe('群体锦囊「不识破」', () => {
  it('同一张锦囊后续目标自动不出；反制别人的【识破】和其他锦囊仍询问', async () => {
    const h = new HumanController();
    const first = h.decide(view, shipo(5));
    expect(h.pending).not.toBeNull();
    h.skipShipo(5);
    expect(await first).toBeNull();
    expect(await h.decide(view, shipo(5))).toBeNull();
    expect(h.pending).toBeNull();
    void h.decide(view, shipo(5, true));
    expect(h.pending).not.toBeNull();
    h.answer(null);
    void h.decide(view, shipo(6));
    expect(h.pending).not.toBeNull();
  });

  it('引擎：【檄文】的识破询问带有锦囊 id 和群体标记，单体锦囊没有群体标记', async () => {
    const seen: Request[] = [];
    const ctrls = ROLES.map(() => new Scripted((_v, req) => (seen.push(req), undefined) as never));
    const { game } = await makeGame(ctrls, ROLES, {});
    give(game, 1, 'shipo');
    const xw = give(game, 0, 'xiwen');
    game.takeFromHand(game.players[0], xw.id);
    await game.useCard(game.players[0], xw);
    const asks = seen.filter((r) => r.type === 'respond' && r.reason.kind === 'shipo');
    expect(asks.length).toBeGreaterThan(1);
    for (const r of asks) expect(r.type === 'respond' && r.reason.kind === 'shipo' && r.reason.group && r.reason.trickId === xw.id).toBe(true);
    seen.length = 0;
    const jy = give(game, 0, 'jieying');
    game.takeFromHand(game.players[0], jy.id);
    give(game, 2, 'zhan');
    await game.useCard(game.players[0], jy, 2);
    const one = seen.find((r) => r.type === 'respond' && r.reason.kind === 'shipo');
    expect(one && one.type === 'respond' && one.reason.kind === 'shipo' && one.reason.group).toBe(false);
  });
});
