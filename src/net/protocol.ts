/** 联机消息格式（房主 ↔ 其他玩家），都是普通 JSON */
import type { AiLevel } from '../ai/basic';
import type { Answer } from '../engine/record';
import type { LogEntry, Request, Response, Role, Winner } from '../engine/types';
import type { Resignation } from '../engine/game';
import type { TableSnapshot } from '../ui/table';

/** 限时档位（房主开房时选） */
export type TimerPreset = 'none' | 'relaxed' | 'standard';

export const TIMER_NAME: Record<TimerPreset, string> = { none: '不限时', relaxed: '宽松', standard: '标准' };

/** 每次操作的时限（毫秒）：出牌阶段 / 其他（响应、弃牌、选将等）；null 为不限时 */
export const TIMER_MS: Record<TimerPreset, { play: number; other: number } | null> = {
  none: null,
  relaxed: { play: 60_000, other: 30_000 },
  standard: { play: 30_000, other: 15_000 },
};

export function timeLimit(preset: TimerPreset, req: Request): number | null {
  const t = TIMER_MS[preset];
  if (!t) return null;
  return req.type === 'play' ? t.play : t.other;
}

export interface RoomSettings {
  /** 人数：2 = 1v1，4 = 2v2，5–8 = 身份局 */
  players: number;
  level: AiLevel;
  timer: TimerPreset;
}

export interface MemberInfo {
  id: string;
  name: string;
  ready: boolean;
  host: boolean;
  /** 连接正常（断线时为 false） */
  online: boolean;
}

export interface LobbyState {
  roomId: string;
  settings: RoomSettings;
  members: MemberInfo[];
  /** 有一局在进行或刚结束、房主还没回到房间 */
  playing: boolean;
}

/** 对局中各座位的状态（公开） */
export interface SeatInfo {
  /** 真人玩家的成员 id；电脑为 null */
  member: string | null;
  /** 真人掉线、由电脑托管中 */
  away: boolean;
}

/** 对局结束后房主发给所有人的回放数据（各自补上自己的座位后存成记录） */
export interface SharedRecord {
  seed: number;
  names: string[];
  answers: Answer[];
  winner: Winner;
  turns: number;
  logLength: number;
  resign?: Resignation;
  mulligan: number[];
  level: AiLevel;
  roles: Role[];
  generals: string[];
  alive: boolean[];
}

// ───────────── 玩家 → 房主 ─────────────

export type ClientMsg =
  /** 进房 / 重连：token 只有自己知道，用来认回原来的座位 */
  | { t: 'hello'; name: string; token: string }
  | { t: 'ready'; ready: boolean }
  /** 回答第 id 次询问 */
  | { t: 'answer'; id: number; r: Response<Request> }
  | { t: 'skipShipo'; id: number; trickId: number }
  | { t: 'resign' }
  | { t: 'leave' }
  /** 心跳 */
  | { t: 'ping' };

// ───────────── 房主 → 玩家 ─────────────

export type HostMsg =
  | { t: 'welcome'; you: string }
  | { t: 'reject'; reason: string }
  | { t: 'lobby'; lobby: LobbyState }
  /**
   * 牌桌快照（只含本座位能看到的信息）。出牌记录增量发送：log 是从第 logFrom 条开始的新记录。
   * pendingId 为当前询问的编号（回答时带上）；timeLeft 为剩余毫秒数（不限时为 null）。
   */
  | {
      t: 'table';
      snap: Omit<TableSnapshot, 'log'>;
      logFrom: number;
      log: LogEntry[];
      pendingId: number | null;
      timeLeft: number | null;
      seats: SeatInfo[];
    }
  | { t: 'record'; record: SharedRecord }
  /** 房主关闭了房间 */
  | { t: 'closed' }
  /** 心跳 */
  | { t: 'ping' };

/** 心跳：每隔 every 毫秒互发一次；超过 timeout 毫秒没收到对方任何消息就当作断线 */
export interface Heartbeat {
  every: number;
  timeout: number;
}
export const HOST_HEARTBEAT: Heartbeat = { every: 2000, timeout: 8000 };
export const CLIENT_HEARTBEAT: Heartbeat = { every: 2000, timeout: 10000 };

export function isClientMsg(m: unknown): m is ClientMsg {
  return typeof m === 'object' && m !== null && typeof (m as { t?: unknown }).t === 'string';
}
