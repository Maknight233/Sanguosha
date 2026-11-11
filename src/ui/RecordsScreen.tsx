import { useRef, useState, type ReactNode } from 'react';
import { AI_LEVEL_NAME, type AiLevel } from '../ai/basic';
import { generalDef } from '../data/generals';
import { PLAYER_COUNTS, ROLE_NAME, WINNER_NAME } from '../engine/game';
import type { GameRecord } from '../engine/record';
import type { Role } from '../engine/types';
import { addImported, clearStats, loadImported, loadRecords, loadStats, MAX_RECORDS, recordPlayers, removeImported, replaceAll, winRate, type Stats } from './storage';
import { backupFile, download, parseImport, recordFile, stamp } from './transfer';

const ROLES: Role[] = ['lord', 'loyalist', 'rebel', 'renegade'];
const LEVELS = Object.keys(AI_LEVEL_NAME) as AiLevel[];
const levelName = (l?: string) => AI_LEVEL_NAME[(l ?? 'normal') as AiLevel] ?? l;

function formatDate(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 对局记录：最近的对局（可回放）+ 累计战绩 */
export function RecordsScreen({ onBack, onReplay }: { onBack: () => void; onReplay: (rec: GameRecord) => void }) {
  const [records, setRecords] = useState(loadRecords);
  const [stats, setStats] = useState(loadStats);
  const [imported, setImported] = useState(loadImported);
  const [confirming, setConfirming] = useState(false);
  /** 待确认替换的全量备份 */
  const [pendingBackup, setPendingBackup] = useState<{ records: GameRecord[]; stats: Stats } | null>(null);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const exportAll = () => download(`sanguo-backup-${stamp(Date.now())}.json`, backupFile(records, stats));
  const exportOne = (r: GameRecord) => download(`sanguo-record-${stamp(r.date)}.json`, recordFile(r));
  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const res = parseImport(await file.text());
    if (fileRef.current) fileRef.current.value = '';
    if (res.kind === 'error') return setMessage({ text: `导入失败：${res.message}`, error: true });
    if (res.kind === 'record') {
      setImported(addImported(res.record));
      return setMessage({ text: '已导入 1 局回放（在「导入的回放」中，不计入战绩）。' });
    }
    setMessage(null);
    setPendingBackup({ records: res.records, stats: res.stats });
  };
  const confirmBackup = () => {
    if (!pendingBackup) return;
    replaceAll(pendingBackup.records, pendingBackup.stats);
    setRecords(loadRecords());
    setStats(loadStats());
    setPendingBackup(null);
    setMessage({ text: '已用备份替换对局记录与战绩。' });
  };
  const generals = Object.entries(stats.byGeneral).sort((a, b) => b[1].games - a[1].games);

  return (
    <main className="rules records">
      <button onClick={onBack}>← 返回</button>
      <h1>对局记录</h1>
      <div className="transfer-bar">
        <button onClick={exportAll} title="导出最近对局与累计战绩，用于备份">
          导出全部
        </button>
        <button onClick={() => fileRef.current?.click()} title="导入单局回放或全量备份">
          导入文件
        </button>
        <input ref={fileRef} type="file" accept=".json,application/json" hidden aria-label="导入文件" onChange={(e) => onFile(e.target.files?.[0])} />
        {message && <span className={message.error ? 'red' : 'muted'}>{message.text}</span>}
      </div>
      {pendingBackup && (
        <div className="confirm-box">
          <p>
            这是一份全量备份：<b>{pendingBackup.records.length}</b> 局对局记录，累计战绩 <b>{pendingBackup.stats.total.games}</b> 局（胜{' '}
            {pendingBackup.stats.total.wins} 局）。
          </p>
          <p>
            导入会<b>替换</b>你当前的 {records.length} 局记录和 {stats.total.games} 局战绩（「导入的回放」不受影响）。确定吗？
          </p>
          <button onClick={confirmBackup}>确定替换</button>
          <button onClick={() => setPendingBackup(null)}>取消</button>
        </div>
      )}

      <h2>战绩</h2>
      {stats.total.games === 0 ? (
        <p className="muted">还没有打完的对局。</p>
      ) : (
        <>
          <p>
            共 <b>{stats.total.games}</b> 局，胜 <b>{stats.total.wins}</b> 局，胜率 <b>{winRate(stats.total)}</b>。
          </p>
          <div className="stats-tables">
            <table>
              <thead>
                <tr>
                  <th>身份</th>
                  <th>局数</th>
                  <th>胜率</th>
                </tr>
              </thead>
              <tbody>
                {ROLES.map((r) => (
                  <tr key={r}>
                    <td>{ROLE_NAME[r]}</td>
                    <td>{stats.byRole[r]?.games ?? 0}</td>
                    <td>{winRate(stats.byRole[r])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <table>
              <thead>
                <tr>
                  <th>电脑难度</th>
                  <th>局数</th>
                  <th>胜率</th>
                </tr>
              </thead>
              <tbody>
                {LEVELS.map((l) => (
                  <tr key={l}>
                    <td>{AI_LEVEL_NAME[l]}</td>
                    <td>{stats.byLevel?.[l]?.games ?? 0}</td>
                    <td>{winRate(stats.byLevel?.[l])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <table>
              <thead>
                <tr>
                  <th>人数</th>
                  <th>局数</th>
                  <th>胜率</th>
                </tr>
              </thead>
              <tbody>
                {PLAYER_COUNTS.map((n) => (
                  <tr key={n}>
                    <td>{n} 人</td>
                    <td>{stats.byPlayers?.[n]?.games ?? 0}</td>
                    <td>{winRate(stats.byPlayers?.[n])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <table>
              <thead>
                <tr>
                  <th>武将</th>
                  <th>局数</th>
                  <th>胜率</th>
                </tr>
              </thead>
              <tbody>
                {generals.map(([g, t]) => (
                  <tr key={g}>
                    <td>{generalDef(g).name}</td>
                    <td>{t.games}</td>
                    <td>{winRate(t)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {stats.total.games > 0 &&
        (confirming ? (
          <span>
            确定清空全部战绩？（对局记录不受影响）
            <button
              onClick={() => {
                clearStats();
                setStats(loadStats());
                setConfirming(false);
              }}
            >
              确定清空
            </button>
            <button onClick={() => setConfirming(false)}>取消</button>
          </span>
        ) : (
          <button onClick={() => setConfirming(true)}>清空战绩</button>
        ))}

      <h2>最近对局（最多 {MAX_RECORDS} 局）</h2>
      {records.length === 0 ? (
        <p className="muted">还没有对局记录。打完一局后会自动保存。</p>
      ) : (
        <RecordTable
          records={records}
          actions={(r) => (
            <>
              <button onClick={() => onReplay(r)}>回放</button>
              <button onClick={() => exportOne(r)}>导出</button>
            </>
          )}
        />
      )}

      <h2>导入的回放（最多 {MAX_RECORDS} 局，不计入战绩）</h2>
      {imported.length === 0 ? (
        <p className="muted">还没有导入的回放。别人导出的单局文件可以用「导入文件」打开。</p>
      ) : (
        <RecordTable
          records={imported}
          imported
          actions={(r) => (
            <>
              <button onClick={() => onReplay(r)}>回放</button>
              <button onClick={() => exportOne(r)}>导出</button>
              <button onClick={() => setImported(removeImported(r.id))}>删除</button>
            </>
          )}
        />
      )}
    </main>
  );
}

/** 对局列表；imported 时标注「导入」，「你的武将」为原玩家的 */
function RecordTable({ records, actions, imported }: { records: GameRecord[]; actions: (r: GameRecord) => ReactNode; imported?: boolean }) {
  return (
    <table className="records-table">
      <thead>
        <tr>
          <th>时间</th>
          <th>{imported ? '玩家武将' : '你的武将'}</th>
          <th>身份</th>
          <th>人数</th>
          <th>难度</th>
          <th>结果</th>
          <th>回合</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {records.map((r) => (
          <tr key={r.id}>
            <td>
              {formatDate(r.date)}
              {imported && <span className="import-tag">导入</span>}
            </td>
            <td>{generalDef(r.general).name}</td>
            <td>{ROLE_NAME[r.role]}</td>
            <td>{recordPlayers(r)}</td>
            <td>{levelName(r.level)}</td>
            <td className={r.won ? 'win' : 'muted'}>
              {r.won ? '胜' : '负'}（{WINNER_NAME[r.winner]}获胜）
            </td>
            <td>{r.turns}</td>
            <td className="record-actions">{actions(r)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
