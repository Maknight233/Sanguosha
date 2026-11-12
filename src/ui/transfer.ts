/** 导出 / 导入：单局记录（分享）与全量备份（最近记录 + 累计战绩） */
import { GENERALS } from '../data/generals';
import type { GameRecord } from '../engine/record';
import type { Stats } from './storage';

const APP = 'sanguo-identity';
const FILE_VERSION = 1;

export interface RecordFile {
  app: typeof APP;
  kind: 'record';
  version: number;
  record: GameRecord;
}

export interface BackupFile {
  app: typeof APP;
  kind: 'backup';
  version: number;
  exportedAt: number;
  records: GameRecord[];
  stats: Stats;
}

export type ImportResult = { kind: 'record'; record: GameRecord } | { kind: 'backup'; records: GameRecord[]; stats: Stats } | { kind: 'error'; message: string };

export function recordFile(record: GameRecord): RecordFile {
  return { app: APP, kind: 'record', version: FILE_VERSION, record };
}

export function backupFile(records: GameRecord[], stats: Stats, now = Date.now()): BackupFile {
  return { app: APP, kind: 'backup', version: FILE_VERSION, exportedAt: now, records, stats };
}

const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const ROLES = ['lord', 'loyalist', 'rebel', 'renegade'];
const WINNERS = ['lord', 'rebel', 'renegade', 'draw'];

/** 检查记录的结构是否完整（不检查能否重现，回放时会提示） */
export function validRecord(r: unknown): r is GameRecord {
  if (!r || typeof r !== 'object') return false;
  const x = r as Record<string, unknown>;
  return (
    isNum(x.version) &&
    typeof x.id === 'string' &&
    isNum(x.date) &&
    isNum(x.seed) &&
    Array.isArray(x.names) &&
    x.names.length >= 5 &&
    x.names.length <= 8 &&
    x.names.every((n) => typeof n === 'string') &&
    isNum(x.human) &&
    Array.isArray(x.answers) &&
    x.answers.every((a) => a && typeof a === 'object' && isNum((a as { seat: unknown }).seat)) &&
    WINNERS.includes(x.winner as string) &&
    isNum(x.turns) &&
    ROLES.includes(x.role as string) &&
    typeof x.general === 'string' &&
    x.general in GENERALS &&
    typeof x.won === 'boolean' &&
    isNum(x.logLength)
  );
}

function validTally(t: unknown): boolean {
  return !!t && typeof t === 'object' && isNum((t as { games: unknown }).games) && isNum((t as { wins: unknown }).wins);
}

function validStats(s: unknown): s is Stats {
  if (!s || typeof s !== 'object') return false;
  const x = s as Record<string, unknown>;
  const map = (m: unknown, optional = false) =>
    (optional && m === undefined) || (!!m && typeof m === 'object' && Object.values(m as object).every(validTally));
  return validTally(x.total) && map(x.byRole) && map(x.byGeneral) && map(x.byLevel, true) && map(x.byPlayers, true);
}

/** 解析导入的文件内容，自动识别单局 / 全量备份 */
export function parseImport(text: string): ImportResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { kind: 'error', message: '文件不是有效的 JSON。' };
  }
  const d = data as { app?: unknown; kind?: unknown; version?: unknown; record?: unknown; records?: unknown; stats?: unknown } | null;
  if (!d || d.app !== APP) return { kind: 'error', message: '这不是本游戏导出的文件。' };
  if (!isNum(d.version) || d.version > FILE_VERSION) return { kind: 'error', message: '文件来自更新的版本，无法导入。' };
  if (d.kind === 'record') {
    return validRecord(d.record) ? { kind: 'record', record: d.record } : { kind: 'error', message: '对局记录内容不完整或已损坏。' };
  }
  if (d.kind === 'backup') {
    if (!Array.isArray(d.records) || !d.records.every(validRecord)) return { kind: 'error', message: '备份中的对局记录不完整或已损坏。' };
    if (!validStats(d.stats)) return { kind: 'error', message: '备份中的战绩不完整或已损坏。' };
    return { kind: 'backup', records: d.records, stats: d.stats };
  }
  return { kind: 'error', message: '无法识别的文件类型。' };
}

/** 文件名用的时间：20261111-1530 */
export function stamp(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

/** 让浏览器下载一个 JSON 文件 */
export function download(name: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
