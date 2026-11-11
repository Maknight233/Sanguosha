import { useEffect, useRef, useState } from 'react';
import { generalDef } from '../data/generals';
import { ROLE_NAME, WINNER_NAME } from '../engine/game';
import { aiOpinions, observerOpinions, type Opinion, type Relation } from '../ai/basic';
import { replay, viewFromSnapshot, type GameRecord, type ReplayResult, type Snapshot } from '../engine/record';
import { InferTag, RENEGADE_MODE_NAME } from './infer';
import type { PlayerPublic } from '../engine/types';
import { CardView, SeatView } from './components';
import { dyingSeats, EffectsLayer, PlayZone } from './effects';
import { TooltipHost } from './tooltip';
import { isCrowded, tableSides } from './layout';

/** 牌桌上的座位位置（与对局界面相同） */
const PHASE_NAME: Record<string, string> = {
  setup: '选将',
  prepare: '准备阶段',
  draw: '摸牌阶段',
  play: '出牌阶段',
  discard: '弃牌阶段',
  end: '结束阶段',
  over: '游戏结束',
};
const SPEEDS: Array<[string, number]> = [
  ['快', 200],
  ['中', 600],
  ['慢', 1200],
];

/** 回放局面中的角色：身份与手牌全部公开 */
function asPublic(p: Snapshot['players'][number]): PlayerPublic {
  return { ...p, handCount: p.hand.length };
}

/** 回合开始的日志序号 */
export function turnStarts(log: ReplayResult['log']): number[] {
  return log.flatMap((e, i) => (e.event?.type === 'turn' ? [i] : []));
}

/** 从第 i 步跳到上一回合 / 下一回合的开头 */
export function jumpTurn(starts: number[], i: number, dir: -1 | 1): number {
  if (dir === 1) return starts.find((s) => s > i) ?? i;
  const before = starts.filter((s) => s < i);
  return before.length > 0 ? before[before.length - 1] : 0;
}

export function ReplayScreen({ record, onBack }: { record: GameRecord; onBack: () => void }) {
  const [data, setData] = useState<ReplayResult | null>(null);
  useEffect(() => {
    let alive = true;
    replay(record).then((r) => alive && setData(r));
    return () => {
      alive = false;
    };
  }, [record]);

  if (!data) return <main className="menu">正在载入回放……</main>;
  if (data.snapshots.length === 0)
    return (
      <main className="menu">
        <p>{data.error ?? '回放为空。'}</p>
        <button onClick={onBack}>返回</button>
      </main>
    );
  return <ReplayView record={record} data={data} onBack={onBack} />;
}

/** 回放「读局」视角：off 关闭；observer 旁观者；数字为该座位 AI 的视角 */
type Perspective = 'off' | 'observer' | number;

interface Reading {
  view: ReturnType<typeof viewFromSnapshot>;
  opinions: (Opinion | null)[];
  relations: (Relation | null)[] | null;
  mode: string | null;
}

/** 计算回放某一步在给定视角下的推测 */
export function readingAt(snap: Snapshot, perspective: Perspective): Reading | null {
  if (perspective === 'off' || snap.turn === 0) return null;
  if (perspective === 'observer') {
    const view = viewFromSnapshot(snap, 0);
    return { view, opinions: observerOpinions(view), relations: null, mode: null };
  }
  if (!snap.players[perspective].alive) return null;
  const view = viewFromSnapshot(snap, perspective);
  const r = aiOpinions(view);
  return { view, opinions: r.opinions, relations: r.relations, mode: r.mode };
}

function ReplayView({ record, data, onBack }: { record: GameRecord; data: ReplayResult; onBack: () => void }) {
  const [perspective, setPerspective] = useState<Perspective>('off');
  const last = data.snapshots.length - 1;
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(600);
  const tableRef = useRef<HTMLDivElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const starts = turnStarts(data.log);
  const go = (i: number) => setStep(Math.max(0, Math.min(last, i)));

  // 自动播放
  useEffect(() => {
    if (!playing) return;
    if (step >= last) return setPlaying(false);
    const t = setTimeout(() => setStep((s) => Math.min(last, s + 1)), speed);
    return () => clearTimeout(t);
  }, [playing, step, speed, last]);

  // 快捷键：← → 单步，空格播放/暂停，PageUp/PageDown 按回合跳，Home/End 开头/结尾
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyRef.current = (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target instanceof HTMLSelectElement) return;
    const actions: Record<string, () => void> = {
      ArrowLeft: () => go(step - 1),
      ArrowRight: () => go(step + 1),
      ' ': () => setPlaying((p) => !p),
      PageUp: () => go(jumpTurn(starts, step, -1)),
      PageDown: () => go(jumpTurn(starts, step, 1)),
      Home: () => go(0),
      End: () => go(last),
      Escape: onBack,
    };
    const f = actions[e.key];
    if (!f) return;
    e.preventDefault();
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    f();
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  // 日志自动滚动到当前步
  useEffect(() => {
    logRef.current?.querySelector('.log-current')?.scrollIntoView?.({ block: 'nearest' });
  }, [step]);

  const snap = data.snapshots[step];
  const log = data.log.slice(0, step + 1);
  const reading = readingAt(snap, perspective);
  const shortName = (s: number) => {
    const p = snap.players[s];
    return p.general ? generalDef(p.general).name : p.name;
  };

  return (
    <div className="game-layout replay">
      <div className={`table ${isCrowded(snap.players.length) ? 'crowded' : ''}`} ref={tableRef}>
        {(['me', 'right', 'top', 'left'] as const).map((side) => (
          <div key={side} className={side === 'me' ? 'area-me' : `seat-row seat-row-${side}`}>
            {(side === 'me' ? [0] : tableSides(snap.players.length)[side]).map((seat) => snap.players[seat]).map((p) => (
            <div key={p.seat} className="replay-seat">
              <SeatView
                p={asPublic(p)}
                isCurrent={snap.current === p.seat && snap.turn > 0}
                selectable={false}
                selected={false}
                distance={null}
                inRange={false}
                onClick={() => {}}
                extra={
                  reading && (
                    <InferTag view={reading.view} seat={p.seat} op={reading.opinions[p.seat]} relation={reading.relations?.[p.seat]} />
                  )
                }
              />
              <div className="replay-hand">
                {p.hand.map((c) => (
                  <CardView key={c.id} card={c} small />
                ))}
                {p.alive && p.hand.length === 0 && <span className="muted">（无手牌）</span>}
              </div>
            </div>
            ))}
          </div>
        ))}
        <div className="area-center">
          <div className="center-info">
            <div>
              回放 · 第 {snap.turn} 回合 · {snap.phase === 'over' ? '游戏结束' : snap.turn > 0 ? `${snap.players[snap.current].name} 的${PHASE_NAME[snap.phase]}` : '选将'}
            </div>
            <div className="muted">
              牌堆 {snap.drawPileCount} 张 · 弃牌堆 {snap.discardPileCount} 张 · 第 {step + 1}/{last + 1} 步
            </div>
          </div>
          {dyingSeats(snap.players).map((s) => (
            <div key={s} className="dying-banner">
              {shortName(s)} 濒死
            </div>
          ))}
          <PlayZone log={log} shortName={shortName} />
          <div className="replay-controls">
            <button onClick={() => go(0)} title="开头 (Home)">⏮</button>
            <button onClick={() => go(jumpTurn(starts, step, -1))} title="上一回合 (PageUp)">上一回合</button>
            <button onClick={() => go(step - 1)} title="上一步 (←)">◀</button>
            <button className="primary" onClick={() => setPlaying((p) => !p)} title="播放/暂停 (空格)">
              {playing ? '暂停' : '播放'}
            </button>
            <button onClick={() => go(step + 1)} title="下一步 (→)">▶</button>
            <button onClick={() => go(jumpTurn(starts, step, 1))} title="下一回合 (PageDown)">下一回合</button>
            <button onClick={() => go(last)} title="结尾 (End)">⏭</button>
          </div>
          <input
            className="replay-slider"
            type="range"
            min={0}
            max={last}
            value={step}
            aria-label="回放进度"
            onChange={(e) => go(Number(e.target.value))}
          />
          <div className="speed">
            播放速度：
            {SPEEDS.map(([label, ms]) => (
              <button key={label} className={speed === ms ? 'active' : ''} onClick={() => setSpeed(ms)}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <EffectsLayer log={log} container={tableRef} maxBatch={3} />
      </div>
      <aside className="side">
        <div className="side-buttons">
          <button onClick={onBack}>返回</button>
        </div>
        <div className="replay-summary">
          <b>{WINNER_NAME[record.winner]}</b>获胜 · 共 {record.turns} 回合 · 你是 {ROLE_NAME[record.role]}（{generalDef(record.general).name}）
          {data.error && <div className="red">{data.error}</div>}
        </div>
        <div className="replay-perspective">
          <label>
            读局视角：
            <select
              aria-label="读局视角"
              value={String(perspective)}
              onChange={(e) => {
                const v = e.target.value;
                setPerspective(v === 'off' || v === 'observer' ? v : Number(v));
              }}
            >
              <option value="off">关闭</option>
              <option value="observer">旁观者（只看公开信息）</option>
              {snap.players.map((p) => (
                <option key={p.seat} value={p.seat}>
                  {p.seat === 0 ? '你' : p.name}（{p.general ? generalDef(p.general).name : '?'}·{ROLE_NAME[p.role]}）的 AI 视角
                </option>
              ))}
            </select>
          </label>
          {typeof perspective === 'number' && !snap.players[perspective].alive && <span className="muted">此角色已阵亡</span>}
          {reading?.mode && <span className="muted">内奸策略：{RENEGADE_MODE_NAME[reading.mode]}</span>}
        </div>
        <div className="log" ref={logRef}>
          {data.log.map((e, i) => (
            <div
              key={i}
              className={['log-entry', e.text.startsWith('——') && 'log-turn', i === step && 'log-current', i > step && 'log-future']
                .filter(Boolean)
                .join(' ')}
              onClick={() => go(i)}
            >
              {e.text}
            </div>
          ))}
        </div>
      </aside>
      <TooltipHost />
    </div>
  );
}
