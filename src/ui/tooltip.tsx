import { useEffect, useLayoutEffect, useReducer, useRef, useState, type MouseEvent, type ReactNode, type TouchEvent } from 'react';
import { cardDef, isRed, SUIT_SYMBOL } from '../data/cards';
import type { Card } from '../engine/types';

// ───────────── 全局悬浮提示：同一时间只显示一个 ─────────────

interface TipState {
  content: ReactNode;
  x: number;
  y: number;
  anchor: Element;
  /** 触屏长按出来的提示：显示在手指上方，松手即关 */
  touch?: boolean;
}

/** 触屏长按多久（毫秒）显示说明 */
const LONG_PRESS = 380;
let pressTimer: ReturnType<typeof setTimeout> | null = null;
let pressStart = { x: 0, y: 0 };
/** 长按松手后浏览器可能补发一次点击，在这个时间点之前的点击要吞掉，免得误选牌 */
let swallowClickUntil = 0;
/** 触屏操作后浏览器会补发鼠标事件，这段时间内忽略鼠标悬浮 */
let ignoreMouseUntil = 0;
function cancelPress() {
  if (pressTimer) clearTimeout(pressTimer);
  pressTimer = null;
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
      if (Date.now() < ignoreMouseUntil) return;
      const c = get();
      if (c) setTip({ content: c, x: e.clientX, y: e.clientY, anchor: e.currentTarget });
    },
    onMouseMove: (e: MouseEvent) => {
      if (tip && tip.anchor === e.currentTarget) setTip({ ...tip, x: e.clientX, y: e.clientY });
    },
    onMouseLeave: (e: MouseEvent) => {
      if (tip && tip.anchor === e.currentTarget) setTip(null);
    },
    // 触屏：按住不动一会儿显示说明，松手关闭；短按仍是普通点击
    onTouchStart: (e: TouchEvent) => {
      const t = e.touches[0];
      const anchor = e.currentTarget;
      ignoreMouseUntil = Date.now() + 1000;
      cancelPress();
      if (!t || e.touches.length > 1) return;
      pressStart = { x: t.clientX, y: t.clientY };
      pressTimer = setTimeout(() => {
        pressTimer = null;
        const c = get();
        if (!c || !anchor.isConnected) return;
        swallowClickUntil = Number.POSITIVE_INFINITY;
        setTip({ content: c, x: pressStart.x, y: pressStart.y, anchor, touch: true });
      }, LONG_PRESS);
    },
    onTouchMove: (e: TouchEvent) => {
      const t = e.touches[0];
      if (t && Math.hypot(t.clientX - pressStart.x, t.clientY - pressStart.y) > 10) cancelPress();
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
    const onDown = () => tip && !tip.touch && setTip(null);
    // 触屏松手：取消计时；如果长按提示已经出来，关掉它并吞掉紧随其后的那次点击
    const onTouchEnd = () => {
      cancelPress();
      ignoreMouseUntil = Date.now() + 1000;
      if (tip?.touch) {
        swallowClickUntil = Date.now() + 500;
        setTip(null);
      }
    };
    const onClickCapture = (e: Event) => {
      if (Date.now() >= swallowClickUntil) return;
      swallowClickUntil = 0;
      e.stopPropagation();
      e.preventDefault();
    };
    // 长按时不弹系统菜单
    const onContextMenu = (e: Event) => {
      if (tip?.touch || pressTimer) e.preventDefault();
    };
    document.addEventListener('mouseover', onOver);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchend', onTouchEnd);
    document.addEventListener('touchcancel', onTouchEnd);
    document.addEventListener('click', onClickCapture, true);
    document.addEventListener('contextmenu', onContextMenu);
    return () => {
      listeners.delete(rerender);
      document.removeEventListener('mouseover', onOver);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchend', onTouchEnd);
      document.removeEventListener('touchcancel', onTouchEnd);
      document.removeEventListener('click', onClickCapture, true);
      document.removeEventListener('contextmenu', onContextMenu);
      cancelPress();
      swallowClickUntil = 0;
      setTip(null);
    };
  }, []);

  // 根据提示框大小避开屏幕边缘
  useLayoutEffect(() => {
    if (!tip || !ref.current) return;
    const { width, height } = ref.current.getBoundingClientRect();
    let left = tip.x + OFFSET;
    let top = tip.y + OFFSET;
    if (tip.touch) {
      // 手指会挡住下方：居中显示在手指上方，放不下再放到下方
      left = tip.x - width / 2;
      top = tip.y - 28 - height;
      if (top < 4) top = tip.y + 28;
      if (left + width > window.innerWidth - 4) left = window.innerWidth - 4 - width;
    } else {
      if (left + width > window.innerWidth - 4) left = tip.x - OFFSET - width;
      if (top + height > window.innerHeight - 4) top = tip.y - OFFSET - height;
    }
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
