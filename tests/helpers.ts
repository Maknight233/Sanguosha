import { cardDef } from '../src/data/cards';
import { Game } from '../src/engine/game';
import type { Card, Controller, GameView, Request, Response, Role } from '../src/engine/types';

type Handler = (view: GameView, req: Request) => Response<Request> | undefined;

/** 测试用控制器：按脚本回答，未覆盖的请求使用保守默认值 */
export class Scripted implements Controller {
  requests: Request[] = [];
  constructor(public handler: Handler = () => undefined) {}

  async decide<R extends Request>(view: GameView, req: R): Promise<Response<R>> {
    this.requests.push(req);
    const r = this.handler(view, req);
    if (r !== undefined) return r as Response<R>;
    switch (req.type) {
      case 'chooseGeneral':
        return req.options[0] as Response<R>;
      case 'play':
        return { type: 'end' } as Response<R>;
      case 'respond':
        return null as Response<R>;
      case 'discard': {
        const hand = view.players[view.me].hand!;
        return hand.slice(0, req.count).map((c) => c.id) as Response<R>;
      }
      case 'chooseCard':
        return { zone: 'hand' } as Response<R>;
      case 'choose':
        return req.options[0].id as Response<R>;
      case 'selectCards':
        return req.cards.slice(0, req.count).map((c) => c.id) as Response<R>;
      case 'orderCards':
        return req.cards.map((c) => c.id) as Response<R>;
      case 'mulligan':
        return false as Response<R>;
    }
    throw new Error('unreachable');
  }
}

export const ROLES: Role[] = ['lord', 'loyalist', 'rebel', 'rebel', 'renegade'];
export const GENERALS = ['caocao', 'guojia', 'zhangliao', 'liubei', 'zhaoyun'];

/** 建立一局已完成 setup 的游戏，所有人手牌清空（牌放回牌堆，保持总数不变） */
export async function makeGame(
  controllers?: Scripted[],
  roles: Role[] = ROLES,
  opts: { generals?: string[]; skills?: boolean } = {},
) {
  const ctrls = controllers ?? ROLES.map(() => new Scripted());
  const game = new Game({
    controllers: ctrls,
    seed: 42,
    roles,
    generals: opts.generals ?? GENERALS,
    disableSkills: !opts.skills,
  });
  await game.setup();
  for (const p of game.players) game.drawPile.push(...p.hand.splice(0));
  return { game, ctrls };
}

/** 从牌堆/弃牌堆中取出一张指定种类的牌交给某玩家 */
export function give(game: Game, seat: number, key: string): Card {
  for (const pile of [game.drawPile, game.discardPile]) {
    const i = pile.findIndex((c) => c.key === key);
    if (i >= 0) {
      const card = pile.splice(i, 1)[0];
      game.players[seat].hand.push(card);
      return card;
    }
  }
  throw new Error(`牌堆中没有 ${key}`);
}

/** 装备一张指定的装备牌 */
export function equip(game: Game, seat: number, key: string): Card {
  const card = give(game, seat, key);
  game.players[seat].hand.pop();
  game.players[seat].equips[cardSlot(key)] = card;
  return card;
}

function cardSlot(key: string) {
  return cardDef(key).slot!;
}
