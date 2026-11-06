/** 浏览器本地存储：最近的对局记录 + 累计战绩 */
import type { GameRecord } from '../engine/record';
import type { Role } from '../engine/types';

export const MAX_RECORDS = 20;
const RECORDS_KEY = 'sanguo.records';
const STATS_KEY = 'sanguo.stats';

export interface Tally {
  games: number;
  wins: number;
}

export interface Stats {
  total: Tally;
  byRole: Partial<Record<Role, Tally>>;
  byGeneral: Record<string, Tally>;
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

export const emptyStats = (): Stats => ({ total: { games: 0, wins: 0 }, byRole: {}, byGeneral: {} });

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
  stats.total = bump(stats.total, rec.won);
  stats.byRole[rec.role] = bump(stats.byRole[rec.role], rec.won);
  stats.byGeneral[rec.general] = bump(stats.byGeneral[rec.general], rec.won);
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

export const winRate = (t: Tally | undefined) => (t && t.games > 0 ? `${((t.wins / t.games) * 100).toFixed(0)}%` : '-');
