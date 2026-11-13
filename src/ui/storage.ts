/** 浏览器本地存储：最近的对局记录 + 累计战绩 */
import { isDuel, isVersus, TEAM_PLAYERS } from '../engine/game';
import type { GameRecord } from '../engine/record';
import type { AiLevel } from '../ai/basic';
import type { Role } from '../engine/types';

export const MAX_RECORDS = 20;
const RECORDS_KEY = 'sanguo.records';
const STATS_KEY = 'sanguo.stats';
const LEVEL_KEY = 'sanguo.level';
const PLAYERS_KEY = 'sanguo.players';
const INFER_KEY = 'sanguo.infer';
const IMPORTED_KEY = 'sanguo.imported';
const TUTORIAL_KEY = 'sanguo.tutorialAsked';

export interface Tally {
  games: number;
  wins: number;
}

export interface Stats {
  total: Tally;
  byRole: Partial<Record<Role, Tally>>;
  byGeneral: Record<string, Tally>;
  /** 按 AI 难度（旧数据没有此项） */
  byLevel?: Partial<Record<AiLevel, Tally>>;
  /** 按人数（旧数据没有此项；旧记录都是 5 人） */
  byPlayers?: Record<string, Tally>;
}

type KV = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** 默认使用 localStorage；不可用（如隐私模式）时退回内存 */
function defaultStore(): KV {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    /* 忽略 */
  }
  const mem = new Map<string, string>();
  return {
    getItem: (k) => mem.get(k) ?? null,
    setItem: (k, v) => void mem.set(k, v),
    removeItem: (k) => void mem.delete(k),
  };
}

function read<T>(store: KV, key: string, fallback: T): T {
  try {
    const raw = store.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export const emptyStats = (): Stats => ({ total: { games: 0, wins: 0 }, byRole: {}, byGeneral: {}, byLevel: {}, byPlayers: {} });

export function loadRecords(store: KV = defaultStore()): GameRecord[] {
  return read<GameRecord[]>(store, RECORDS_KEY, []);
}

export function loadStats(store: KV = defaultStore()): Stats {
  return read<Stats>(store, STATS_KEY, emptyStats());
}

const bump = (t: Tally | undefined, won: boolean): Tally => ({ games: (t?.games ?? 0) + 1, wins: (t?.wins ?? 0) + (won ? 1 : 0) });

/** 保存一局（最新的在前，只留 MAX_RECORDS 局）并累计战绩 */
export function saveGame(rec: GameRecord, store: KV = defaultStore()): void {
  const records = [rec, ...loadRecords(store).filter((r) => r.id !== rec.id)].slice(0, MAX_RECORDS);
  const stats = loadStats(store);
  // 平局只留记录，不计入战绩
  if (rec.winner === 'draw') {
    store.setItem(RECORDS_KEY, JSON.stringify(records));
    return;
  }
  stats.total = bump(stats.total, rec.won);
  // 身份胜率只统计身份局（1v1 的先手 / 后手不算身份）
  if (!isVersus(recordPlayers(rec))) stats.byRole[rec.role] = bump(stats.byRole[rec.role], rec.won);
  stats.byGeneral[rec.general] = bump(stats.byGeneral[rec.general], rec.won);
  const level = (rec.level ?? 'normal') as AiLevel;
  stats.byLevel = { ...stats.byLevel, [level]: bump(stats.byLevel?.[level], rec.won) };
  const n = String(recordPlayers(rec));
  stats.byPlayers = { ...stats.byPlayers, [n]: bump(stats.byPlayers?.[n], rec.won) };
  try {
    store.setItem(RECORDS_KEY, JSON.stringify(records));
  } catch {
    // 空间不足时只保留一半记录再试
    store.setItem(RECORDS_KEY, JSON.stringify(records.slice(0, Math.ceil(records.length / 2))));
  }
  store.setItem(STATS_KEY, JSON.stringify(stats));
}

export function clearStats(store: KV = defaultStore()): void {
  store.removeItem(STATS_KEY);
}

/** 导入的单局回放（不计入战绩，最新的在前，最多 MAX_RECORDS 局） */
export function loadImported(store: KV = defaultStore()): GameRecord[] {
  return read<GameRecord[]>(store, IMPORTED_KEY, []);
}

export function addImported(rec: GameRecord, store: KV = defaultStore()): GameRecord[] {
  const list = [rec, ...loadImported(store).filter((r) => r.id !== rec.id)].slice(0, MAX_RECORDS);
  store.setItem(IMPORTED_KEY, JSON.stringify(list));
  return list;
}

export function removeImported(id: string, store: KV = defaultStore()): GameRecord[] {
  const list = loadImported(store).filter((r) => r.id !== id);
  store.setItem(IMPORTED_KEY, JSON.stringify(list));
  return list;
}

/** 用全量备份替换自己的对局记录与战绩（导入的回放不受影响） */
export function replaceAll(records: GameRecord[], stats: Stats, store: KV = defaultStore()): void {
  store.setItem(RECORDS_KEY, JSON.stringify(records.slice(0, MAX_RECORDS)));
  store.setItem(STATS_KEY, JSON.stringify(stats));
}

/** 上次选择的 AI 难度 */
export function loadLevel(store: KV = defaultStore()): AiLevel {
  return store.getItem(LEVEL_KEY) === 'easy' ? 'easy' : 'normal';
}

export function saveLevel(level: AiLevel, store: KV = defaultStore()): void {
  store.setItem(LEVEL_KEY, level);
}

/** 上次选择的人数 */
export function loadPlayers(store: KV = defaultStore()): number {
  const n = Number(store.getItem(PLAYERS_KEY));
  return (n >= 5 && n <= 8) || isDuel(n) || n === TEAM_PLAYERS ? n : 5;
}

export function savePlayers(n: number, store: KV = defaultStore()): void {
  store.setItem(PLAYERS_KEY, String(n));
}

/** 「读局」开关（默认关闭） */
export function loadInfer(store: KV = defaultStore()): boolean {
  try {
    return store.getItem(INFER_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveInfer(on: boolean, store: KV = defaultStore()): void {
  try {
    store.setItem(INFER_KEY, on ? '1' : '0');
  } catch {
    /* 忽略 */
  }
}

/** 记录的人数（缺少名字列表的记录按 5 人算） */
export const recordPlayers = (rec: GameRecord) => rec.names?.length ?? 5;

export const winRate = (t: Tally | undefined) => (t && t.games > 0 ? `${((t.wins / t.games) * 100).toFixed(0)}%` : '-');

/** 是否已经问过「要不要看新手教程」。打过对局的老玩家视为已问过 */
export function loadTutorialAsked(store: KV = defaultStore()): boolean {
  try {
    return store.getItem(TUTORIAL_KEY) === '1' || loadStats(store).total.games > 0;
  } catch {
    return true;
  }
}

export function saveTutorialAsked(store: KV = defaultStore()): void {
  try {
    store.setItem(TUTORIAL_KEY, '1');
  } catch {
    /* 忽略 */
  }
}
