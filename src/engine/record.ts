/**
 * 对局记录与回放：引擎是确定性的——同样的随机种子 + 同样的每一步回答 = 同一局。
 * 所以只记录种子和全部回答（人类和 AI 都记，AI 代码以后改了旧记录也能看），回放时重跑一遍。
 */
import { Game } from './game';
import type { Card, Controller, GameView, JudgeCard, LogEntry, Phase, Player, Request, Response, Role, Winner } from './types';

/** 规则改动导致旧记录无法重现时递增 */
export const RECORD_VERSION = 9;

export interface Answer {
  seat: number;
  r: unknown;
}

export interface GameRecord {
  version: number;
  id: string;
  /** 结束时间（毫秒时间戳） */
  date: number;
  seed: number;
  names: string[];
  /** 玩家（人类）座位 */
  human: number;
  answers: Answer[];
  winner: Winner;
  turns: number;
  /** 玩家的身份、武将与胜负（列表与战绩用） */
  role: Role;
  general: string;
  won: boolean;
  /** AI 难度（'easy' | 'normal'；旧记录没有，视为普通） */
  level?: string;
  /** 原局日志条数，用于校验回放是否一致 */
  logLength: number;
}

/** 包装控制器：把每次回答按顺序写入共享列表 */
export class RecordingController implements Controller {
  constructor(
    private readonly inner: Controller,
    private readonly seat: number,
    private readonly sink: Answer[],
  ) {}

  async decide<R extends Request>(view: GameView, req: R): Promise<Response<R>> {
    const r = await this.inner.decide(view, req);
    // 回答都是普通数据，复制一份防止之后被修改
    this.sink.push({ seat: this.seat, r: r === undefined ? null : JSON.parse(JSON.stringify(r)) });
    return r;
  }
}

export class ReplayMismatch extends Error {}

/** 回放用控制器：按顺序取出记录的回答；座位对不上或记录用完说明规则已改变 */
class ReplayController implements Controller {
  constructor(
    private readonly seat: number,
    private readonly state: { answers: Answer[]; i: number },
  ) {}

  async decide<R extends Request>(_view: GameView, _req: R): Promise<Response<R>> {
    const a = this.state.answers[this.state.i];
    if (!a || a.seat !== this.seat) throw new ReplayMismatch(`第 ${this.state.i + 1} 步回答对不上`);
    this.state.i++;
    return a.r as Response<R>;
  }
}

/** 某一时刻的完整局面（所有身份与手牌公开） */
export interface SnapshotPlayer {
  seat: number;
  name: string;
  general: string;
  role: Role;
  hp: number;
  maxHp: number;
  alive: boolean;
  hand: Card[];
  equips: Player['equips'];
  judge: JudgeCard[];
  /** 已主动亮出身份（【隐忍】） */
  revealed?: boolean;
  shielded?: boolean;
  empower?: number;
  damageTaken?: number;
}

export interface Snapshot {
  turn: number;
  current: number;
  phase: Phase;
  drawPileCount: number;
  discardPileCount: number;
  players: SnapshotPlayer[];
  zhanUsed?: number;
  zhanLimit?: number;
  /** 公开的敌对 / 帮助记录与阵亡顺序（「读局」重建推理用） */
  hostility?: number[][];
  help?: number[][];
  deathOrder?: number[];
  quietTurns?: number;
}

export interface ReplayResult {
  log: LogEntry[];
  /** snapshots[i] 为第 i 条日志写入后的局面 */
  snapshots: Snapshot[];
  /** 回放与原局不一致时的说明 */
  error: string | null;
}

function snapshot(game: Game): Snapshot {
  return {
    turn: game.turn,
    current: game.current,
    phase: game.phase,
    drawPileCount: game.drawPile.length,
    discardPileCount: game.discardPile.length,
    players: game.players.map((p) => ({
      seat: p.seat,
      name: p.name,
      general: p.general,
      role: p.role,
      hp: p.hp,
      maxHp: p.maxHp,
      alive: p.alive,
      hand: [...p.hand],
      equips: { ...p.equips },
      judge: p.judge.map((j) => ({ ...j })),
      revealed: game.revealed.has(p.seat),
      shielded: game.shielded.has(p.seat),
      empower: game.empower[p.seat] ?? 0,
      damageTaken: game.damageTaken[p.seat] ?? 0,
    })),
    zhanUsed: game.zhanUsed,
    zhanLimit: game.zhanLimit,
    hostility: game.hostility.map((r) => [...r]),
    help: game.help.map((r) => [...r]),
    deathOrder: [...game.deathOrder],
    quietTurns: game.turn - game.lastDamageTurn,
  };
}

/** 从快照重建 seat 视角能看到的局面（只有自己、主公、阵亡者、已亮身份者的身份可见） */
export function viewFromSnapshot(snap: Snapshot, seat: number): GameView {
  const n = snap.players.length;
  const zero = () => Array.from({ length: n }, () => Array<number>(n).fill(0));
  return {
    me: seat,
    current: snap.current,
    phase: snap.phase,
    turn: snap.turn,
    drawPileCount: snap.drawPileCount,
    discardPileCount: snap.discardPileCount,
    zhanUsed: snap.zhanUsed ?? 0,
    zhanLimit: snap.zhanLimit ?? 1,
    hostility: snap.hostility ?? zero(),
    help: snap.help ?? zero(),
    deathOrder: snap.deathOrder ?? [],
    quietTurns: snap.quietTurns ?? 0,
    players: snap.players.map((p) => ({
      seat: p.seat,
      name: p.name,
      general: p.general,
      role: p.seat === seat || p.role === 'lord' || !p.alive || p.revealed ? p.role : null,
      hp: p.hp,
      maxHp: p.maxHp,
      alive: p.alive,
      handCount: p.hand.length,
      equips: { ...p.equips },
      judge: p.judge.map((j) => ({ ...j })),
      hand: p.seat === seat ? [...p.hand] : null,
      shielded: p.shielded,
      empower: p.empower,
      damageTaken: p.damageTaken,
    })),
  };
}

/** 用记录重跑一局，收集每条日志之后的局面 */
export async function replay(rec: GameRecord): Promise<ReplayResult> {
  const state = { answers: rec.answers, i: 0 };
  const game = new Game({
    controllers: rec.names.map((_, seat) => new ReplayController(seat, state)),
    names: rec.names,
    seed: rec.seed,
    maxTurns: rec.turns + 5,
  });
  const snapshots: Snapshot[] = [];
  game.subscribe(() => {
    while (snapshots.length < game.log.length) snapshots.push(snapshot(game));
  });
  let error: string | null = rec.version === RECORD_VERSION ? null : '此记录来自旧版本，可能无法完整重现。';
  try {
    const winner = await game.start();
    if (winner !== rec.winner || game.log.length !== rec.logLength || state.i !== rec.answers.length) {
      error = '回放结果与原局不一致：此记录与当前版本不兼容。';
    }
  } catch (e) {
    error = e instanceof ReplayMismatch ? `回放在中途中断（${e.message}）：此记录与当前版本不兼容。` : String(e);
  }
  return { log: game.log, snapshots, error };
}
