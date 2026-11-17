import type { Game, Resignation } from '../engine/game';
import type { GameView, LogEntry, Player, Request, Response, Winner } from '../engine/types';
import type { HumanController } from './controllers';

/** 对局结束后公开的结果（所有身份公开） */
export interface TableOver {
  winner: Winner;
  players: Player[];
  turn: number;
  resigned: Resignation | null;
}

/**
 * 某个座位看到的牌桌：牌桌界面只读这份快照。
 * 单机由本地引擎直接生成；联机由房主生成后发给各座位（不含别人的手牌和隐藏身份）。
 */
export interface TableSnapshot {
  me: number;
  view: GameView;
  /** 出牌记录（公开信息） */
  log: LogEntry[];
  /** 我到各座位的距离（我或对方阵亡时为 null） */
  distance: (number | null)[];
  /** 各座位是否在我的攻击范围内 */
  inRange: boolean[];
  canResign: boolean;
  /** 正在等我回答的询问 */
  pending: Request | null;
  over: TableOver | null;
}

/** 牌桌来源：界面通过它读取快照、提交回答 */
export interface TableClient {
  snapshot(): TableSnapshot;
  subscribe(fn: () => void): () => void;
  answer(r: Response<Request>): void;
  /** 群体锦囊：本张牌剩余目标都不出【识破】 */
  skipShipo(trickId: number): void;
  resign(): void;
}

/** 由引擎与座位视角生成快照（单机与联机房主共用） */
export function snapshotOf(game: Game, me: number, pending: Request | null, over: TableOver | null): TableSnapshot {
  const view = game.view(me);
  const n = game.players.length;
  const meAlive = game.players[me]?.alive ?? false;
  const seats = Array.from({ length: n }, (_, s) => s);
  return {
    me,
    view,
    log: game.log,
    distance: seats.map((s) => (meAlive && game.players[s].alive && s !== me ? game.distance(me, s) : null)),
    inRange: seats.map((s) => meAlive && game.players[s].alive && s !== me && game.inAttackRange(me, s)),
    canResign: game.canResign(me),
    pending,
    over,
  };
}

/** 本机对局：引擎和界面在同一个页面 */
export class LocalTable implements TableClient {
  private over: TableOver | null = null;
  private listeners = new Set<() => void>();
  private unsubs: Array<() => void>;

  constructor(
    readonly game: Game,
    readonly human: HumanController,
    readonly me = 0,
  ) {
    const changed = () => this.listeners.forEach((l) => l());
    this.unsubs = [game.subscribe(changed), human.subscribe(changed)];
  }

  snapshot(): TableSnapshot {
    // 引擎状态是可变的，每次重新生成
    return snapshotOf(this.game, this.me, this.human.pending?.req ?? null, this.over);
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  answer(r: Response<Request>): void {
    this.human.answer(r);
  }

  skipShipo(trickId: number): void {
    this.human.skipShipo(trickId);
  }

  resign(): void {
    this.game.resign(this.me);
    // 正在等你操作时，随便交一个回答让引擎继续（认输在回答后立即生效）
    this.human.answer(null);
  }

  /** 对局结束 */
  finish(winner: Winner): void {
    this.over = { winner, players: this.game.players, turn: this.game.turn, resigned: this.game.resigned };
    this.listeners.forEach((l) => l());
  }

  dispose(): void {
    this.unsubs.forEach((u) => u());
  }
}
