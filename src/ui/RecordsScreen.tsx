import { useState } from 'react';
import { generalDef } from '../data/generals';
import { ROLE_NAME, WINNER_NAME } from '../engine/game';
import type { GameRecord } from '../engine/record';
import type { Role } from '../engine/types';
import { clearStats, loadRecords, loadStats, MAX_RECORDS, winRate } from './storage';

const ROLES: Role[] = ['lord', 'loyalist', 'rebel', 'renegade'];

function formatDate(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 对局记录：最近的对局（可回放）+ 累计战绩 */
export function RecordsScreen({ onBack, onReplay }: { onBack: () => void; onReplay: (rec: GameRecord) => void }) {
  const [records] = useState(loadRecords);
  const [stats, setStats] = useState(loadStats);
  const [confirming, setConfirming] = useState(false);
  const generals = Object.entries(stats.byGeneral).sort((a, b) => b[1].games - a[1].games);

  return (
    <main className="rules records">
      <button onClick={onBack}>← 返回</button>
      <h1>对局记录</h1>

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
        <table className="records-table">
          <thead>
            <tr>
              <th>时间</th>
              <th>你的武将</th>
              <th>身份</th>
              <th>结果</th>
              <th>回合</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {records.map((r) => (
              <tr key={r.id}>
                <td>{formatDate(r.date)}</td>
                <td>{generalDef(r.general).name}</td>
                <td>{ROLE_NAME[r.role]}</td>
                <td className={r.won ? 'win' : 'muted'}>
                  {r.won ? '胜' : '负'}（{WINNER_NAME[r.winner]}获胜）
                </td>
                <td>{r.turns}</td>
                <td>
                  <button onClick={() => onReplay(r)}>回放</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
