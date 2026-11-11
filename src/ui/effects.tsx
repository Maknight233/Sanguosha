import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import type { Card, LogEntry } from '../engine/types';
import { CardView } from './components';

/** 特效持续时间（毫秒）；不阻塞游戏流程 */
export const EFFECT_MS = 800;

type Effect =
  | { id: number; kind: 'arrow'; from: number; to: number; skill: boolean }
  | { id: number; kind: 'damage' | 'recover'; seat: number; amount: number };

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 把新增的日志事件转换成短暂特效 */
function toEffects(entries: LogEntry[], nextId: () => number): Effect[] {
  const out: Effect[] = [];
  for (const e of entries) {
    const ev = e.event;
    if (!ev) continue;
    if (ev.type === 'use') {
      for (const t of ev.to) if (t !== ev.from) out.push({ id: nextId(), kind: 'arrow', from: ev.from, to: t, skill: !!ev.skill });
    } else if (ev.type === 'damage' || ev.type === 'recover') {
      out.push({ id: nextId(), kind: ev.type, seat: ev.seat, amount: ev.amount });
    }
  }
  return out;
}

/** 读取每个座位（data-seat）相对于牌桌容器的位置 */
function measureSeats(container: HTMLElement): Map<number, Rect> {
  const base = container.getBoundingClientRect();
  const map = new Map<number, Rect>();
  container.querySelectorAll<HTMLElement>('[data-seat]').forEach((el) => {
    const r = el.getBoundingClientRect();
    map.set(Number(el.dataset.seat), {
      x: r.left - base.left + container.scrollLeft,
      y: r.top - base.top + container.scrollTop,
      w: r.width,
      h: r.height,
    });
  });
  return map;
}

/** 叠在牌桌上的特效层：出牌指向线、受伤/回复闪光与飘字 */
/** maxBatch：一次最多为多少条新日志生成特效（回放中大步跳转时避免满屏特效） */
export function EffectsLayer({ log, container, maxBatch }: { log: LogEntry[]; container: RefObject<HTMLElement | null>; maxBatch?: number }) {
  const [effects, setEffects] = useState<Effect[]>([]);
  const [rects, setRects] = useState<Map<number, Rect>>(new Map());
  const seen = useRef(log.length);
  const idRef = useRef(0);
  const n = log.length;

  useLayoutEffect(() => {
    if (n <= seen.current) {
      seen.current = n;
      return;
    }
    const from = maxBatch === undefined ? seen.current : Math.max(seen.current, n - maxBatch);
    const fresh = toEffects(log.slice(from, n), () => ++idRef.current);
    seen.current = n;
    if (fresh.length === 0) return;
    if (container.current) setRects(measureSeats(container.current));
    setEffects((list) => [...list, ...fresh]);
    const ids = new Set(fresh.map((f) => f.id));
    setTimeout(() => setEffects((list) => list.filter((f) => !ids.has(f.id))), EFFECT_MS);
  }, [n, log, container, maxBatch]);

  if (effects.length === 0) return null;
  const center = (s: number) => {
    const r = rects.get(s);
    return r ? { x: r.x + r.w / 2, y: r.y + r.h / 2 } : null;
  };
  const arrows = effects.filter((e): e is Extract<Effect, { kind: 'arrow' }> => e.kind === 'arrow');
  const marks = effects.filter((e): e is Extract<Effect, { kind: 'damage' | 'recover' }> => e.kind !== 'arrow');

  return (
    <div className="fx-layer">
      <svg className="fx-svg">
        <defs>
          {/* 毛笔线：边缘轻微抖动；箭头是一笔折锋 */}
          <filter id="fx-brush" x="-5%" y="-5%" width="110%" height="110%">
            <feTurbulence type="fractalNoise" baseFrequency="0.6" numOctaves="1" seed="4" />
            <feDisplacementMap in="SourceGraphic" scale="3" />
          </filter>
          <marker id="fx-head" viewBox="0 0 12 12" refX="7" refY="6" markerWidth="4" markerHeight="4" orient="auto">
            <path d="M0,1 Q6,4 11,6 Q6,8 0,11 Q4,6 0,1 z" fill="#b03a2e" />
          </marker>
          <marker id="fx-head-skill" viewBox="0 0 12 12" refX="7" refY="6" markerWidth="4" markerHeight="4" orient="auto">
            <path d="M0,1 Q6,4 11,6 Q6,8 0,11 Q4,6 0,1 z" fill="#6a4c93" />
          </marker>
        </defs>
        {arrows.map((a) => {
          const p = center(a.from);
          const q = center(a.to);
          if (!p || !q) return null;
          // 微微弯曲的一笔：控制点在中点的垂直方向偏移
          const dx = q.x - p.x;
          const dy = q.y - p.y;
          const bend = (a.id % 2 ? 1 : -1) * 0.12;
          const c = { x: (p.x + q.x) / 2 - dy * bend, y: (p.y + q.y) / 2 + dx * bend };
          const d = `M${p.x},${p.y} Q${c.x},${c.y} ${q.x},${q.y}`;
          return (
            <g key={a.id} className={`fx-arrow ${a.skill ? 'skill' : ''}`}>
              <path className="fx-stroke" d={d} filter="url(#fx-brush)" markerEnd={`url(#${a.skill ? 'fx-head-skill' : 'fx-head'})`} />
              <path className="fx-dry" d={d} />
            </g>
          );
        })}
      </svg>
      {marks.map((m) => {
        const r = rects.get(m.seat);
        if (!r) return null;
        return (
          <div key={m.id} className={`fx-flash fx-${m.kind}`} style={{ left: r.x, top: r.y, width: r.w, height: r.h }}>
            {m.kind === 'damage' ? <InkSplash seed={m.id} heavy={m.amount >= 2} /> : <span className="fx-halo" />}
            <span className="fx-float">{m.kind === 'damage' ? `−${m.amount}` : `+${m.amount}`}</span>
          </div>
        );
      })}
    </div>
  );
}

export interface PlayedCard {
  key: string;
  card: Card;
  from: number;
  to: number[];
  discard: boolean;
  skill?: string;
  /** 附加说明（如判定结果） */
  note?: string;
}

/**
 * 最近一次结算中打出 / 弃置的全部牌：从最后一个带 start 标记的事件起，
 * 包括结算过程中的响应牌（【避】、【识破】、救人的【药】等）。新回合开始时清空。
 */
export function recentPlays(log: LogEntry[]): PlayedCard[] {
  let begin = log.length;
  for (let i = log.length - 1; i >= 0; i--) {
    const ev = log[i].event;
    if (ev?.type === 'turn') break;
    if ((ev?.type === 'use' || ev?.type === 'discard') && ev.start) {
      begin = i;
      break;
    }
  }
  const out: PlayedCard[] = [];
  for (let i = begin; i < log.length; i++) {
    const ev = log[i].event;
    if (ev?.type === 'judge') {
      out.push({ key: `${i}-j`, card: ev.result, from: ev.seat, to: [], discard: false, note: ev.effective ? '判定·生效' : '判定·未生效' });
      continue;
    }
    if (ev?.type !== 'use' && ev?.type !== 'discard') continue;
    const to = ev.type === 'use' ? ev.to : [];
    const skill = ev.type === 'use' ? ev.skill : undefined;
    ev.cards.forEach((card, j) => out.push({ key: `${i}-${j}`, card, from: ev.from, to, discard: ev.type === 'discard', skill }));
  }
  return out;
}

/** 牌桌中央的出牌区 */
export function PlayZone({ log, shortName }: { log: LogEntry[]; shortName: (seat: number) => string }) {
  const plays = recentPlays(log);
  return (
    <div className="play-zone">
      {plays.length === 0 && <span className="play-zone-empty">出牌区</span>}
      {plays.map((p) => (
        <div key={p.key} className="played">
          <CardView card={p.card} small />
          <div className="played-label">
            {shortName(p.from)}
            {p.to.length > 0 && ` → ${p.to.map(shortName).join('、')}`}
            {p.discard && '（弃）'}
            {p.skill && `【${p.skill}】`}
            {p.note && <span className={p.note.endsWith('未生效') ? 'muted' : 'red'}> {p.note}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

/** 当前处于濒死的角色（体力 ≤ 0 但还活着） */
export function dyingSeats(players: ReadonlyArray<{ seat: number; alive: boolean; hp: number }>): number[] {
  return players.filter((p) => p.alive && p.hp <= 0).map((p) => p.seat);
}

/** 受伤的墨点：一大团墨加若干飞溅的小点，形状随 seed 变化 */
export function InkSplash({ seed, heavy }: { seed: number; heavy: boolean }) {
  let x = (seed * 9301 + 49297) % 233280;
  const rnd = () => (x = (x * 9301 + 49297) % 233280) / 233280;
  const drops = Array.from({ length: heavy ? 11 : 7 }, () => {
    const ang = rnd() * Math.PI * 2;
    const dist = 26 + rnd() * 22;
    return { cx: 50 + Math.cos(ang) * dist, cy: 50 + Math.sin(ang) * dist * 0.8, r: 1.5 + rnd() * 4 };
  });
  // 主墨团：12 个随机半径的点，用二次曲线穿过相邻中点连成圆滑轮廓
  const pts = Array.from({ length: 12 }, (_, i) => {
    const ang = (i / 12) * Math.PI * 2;
    const rr = 16 + rnd() * 12;
    return [50 + Math.cos(ang) * rr, 50 + Math.sin(ang) * rr * 0.85];
  });
  const mid = (i: number) => {
    const p = pts[i % 12];
    const q = pts[(i + 1) % 12];
    return `${((p[0] + q[0]) / 2).toFixed(1)},${((p[1] + q[1]) / 2).toFixed(1)}`;
  };
  const blob = `M${mid(11)} ` + pts.map((p, i) => `Q${p[0].toFixed(1)},${p[1].toFixed(1)} ${mid(i)}`).join(' ') + ' Z';
  // 两道甩出的墨痕
  const streaks = Array.from({ length: 2 }, () => {
    const ang = rnd() * Math.PI * 2;
    const r1 = 22;
    const r2 = 40 + rnd() * 8;
    const w = 3 + rnd() * 2;
    const ux = Math.cos(ang);
    const uy = Math.sin(ang);
    return `M${50 + ux * r1 - uy * w},${50 + uy * r1 + ux * w} L${50 + ux * r2},${50 + uy * r2} L${50 + ux * r1 + uy * w},${50 + uy * r1 - ux * w} Z`;
  });
  return (
    <svg className={`fx-splash ${heavy ? 'heavy' : ''}`} viewBox="0 0 100 100" style={{ rotate: `${Math.round(rnd() * 360)}deg` }}>
      <path d={blob} />
      {streaks.map((d, i) => (
        <path key={`s${i}`} d={d} />
      ))}
      {drops.map((d, i) => (
        <circle key={i} cx={d.cx} cy={d.cy} r={d.r} />
      ))}
    </svg>
  );
}
