import { useEffect, useLayoutEffect, useReducer, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { cardDef, isRed, SUIT_SYMBOL } from '../data/cards';
import type { Card } from '../engine/types';

// ───────────── 全局悬浮提示：同一时间只显示一个 ─────────────

interface TipState {
  content: ReactNode;
  x: number;
  y: number;
  anchor: Element;
}

let tip: TipState | null = null;
const listeners = new Set<() => void>();
function setTip(t: TipState | null) {
  tip = t;
  listeners.forEach((l) => l());
}

/**
 * 给元素加悬浮提示：把返回值展开到元素属性上即可。
 * content 为 null 时不显示。
 */
export function tipProps(content: ReactNode | (() => ReactNode)) {
  const get = () => (typeof content === 'function' ? (content as () => ReactNode)() : content);
  return {
    onMouseEnter: (e: MouseEvent) => {
      const c = get();
      if (c) setTip({ content: c, x: e.clientX, y: e.clientY, anchor: e.currentTarget });
    },
    onMouseMove: (e: MouseEvent) => {
      if (tip && tip.anchor === e.currentTarget) setTip({ ...tip, x: e.clientX, y: e.clientY });
    },
    onMouseLeave: (e: MouseEvent) => {
      if (tip && tip.anchor === e.currentTarget) setTip(null);
    },
  };
}

const OFFSET = 14;

/** 渲染当前悬浮提示；在页面中放一个即可 */
export function TooltipHost() {
  const [, rerender] = useReducer((x: number) => x + 1, 0);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: 0, top: 0 });

  useEffect(() => {
    listeners.add(rerender);
    // 鼠标移到提示目标之外（包括目标元素被移除的情况）时关闭
    const onOver = (e: globalThis.MouseEvent) => {
      if (tip && !(tip.anchor.isConnected && tip.anchor.contains(e.target as Node))) setTip(null);
    };
    const onDown = () => tip && setTip(null);
    document.addEventListener('mouseover', onOver);
    document.addEventListener('mousedown', onDown);
    return () => {
      listeners.delete(rerender);
      document.removeEventListener('mouseover', onOver);
      document.removeEventListener('mousedown', onDown);
      setTip(null);
    };
  }, []);

  // 根据提示框大小避开屏幕边缘
  useLayoutEffect(() => {
    if (!tip || !ref.current) return;
    const { width, height } = ref.current.getBoundingClientRect();
    let left = tip.x + OFFSET;
    let top = tip.y + OFFSET;
    if (left + width > window.innerWidth - 4) left = tip.x - OFFSET - width;
    if (top + height > window.innerHeight - 4) top = tip.y - OFFSET - height;
    setPos({ left: Math.max(4, left), top: Math.max(4, top) });
  }, [tip?.x, tip?.y, tip?.content]);

  if (!tip || !tip.anchor.isConnected) return null;
  return (
    <div ref={ref} className="tooltip" style={pos}>
      {tip.content}
    </div>
  );
}

// ───────────── 常用提示内容 ─────────────

const RANK_TEXT = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const KIND_NAME = { basic: '基础牌', trick: '锦囊牌', equip: '装备牌' } as const;
const SLOT_NAME = { weapon: '武器', armor: '防具', horseMinus: '-1马', horsePlus: '+1马' } as const;

export function CardTip({ card }: { card: Card }) {
  const def = cardDef(card.key);
  const sub = [KIND_NAME[def.kind], def.slot && SLOT_NAME[def.slot], def.range && `攻击范围 ${def.range}`].filter(Boolean).join(' · ');
  return (
    <div>
      <div className="tip-head">
        <b>【{def.name}】</b>
        <span className={isRed(card) ? 'red' : 'black'}>
          {SUIT_SYMBOL[card.suit]}
          {RANK_TEXT[card.rank]}
        </span>
      </div>
      <div className="tip-sub">{sub}</div>
      <div>{def.description}</div>
    </div>
  );
}

export function SkillTip({ name, description, lordSkill }: { name: string; description: string; lordSkill?: boolean }) {
  return (
    <div>
      <div className="tip-head">
        <b>【{name}】</b>
        {lordSkill && <span className="tip-sub">主公技</span>}
      </div>
      <div>{description}</div>
    </div>
  );
}
