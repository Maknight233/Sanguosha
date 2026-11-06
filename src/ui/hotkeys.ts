import { useEffect, useRef } from 'react';
import type { Card, PlayOption, Request, SkillOption } from '../engine/types';

// ───────────── 自动选中（纯函数，便于测试）─────────────

/** 出牌：只有一个合法目标时自动选中它（镔铁大戟的额外目标仍手动选） */
export function autoTargetsForOption(option: PlayOption): number[] {
  return option.targets.length === 1 ? [option.targets[0]] : [];
}

/** 技能：第一目标只有一个候选时自动选中它（惑心的第二目标仍手动选） */
export function autoTargetsForSkill(skill: SkillOption): number[] {
  return skill.targets.length === 1 ? [skill.targets[0]] : [];
}

/** 响应：手里刚好只有一张能打出的牌时预先选中它 */
export function autoPickForRespond(req: Request, hand: Card[]): number[] {
  if (req.type !== 'respond') return [];
  const ok = hand.filter((c) => req.accept.includes(c.key));
  return ok.length === 1 ? [ok[0].id] : [];
}

// ───────────── 快捷键 ─────────────

/** 第 i 张（从 0 开始）手牌 / 选项对应的数字键：1–9、0 */
export function indexKey(i: number): string | undefined {
  return i < 9 ? String(i + 1) : i === 9 ? '0' : undefined;
}

/** 数字键 → 序号（从 0 开始），不是数字键时返回 -1 */
export function keyIndex(key: string): number {
  if (key === '0') return 9;
  return /^[1-9]$/.test(key) ? Number(key) - 1 : -1;
}

/** 技能按钮的快捷键：Q、W、R、T（E 留给「结束出牌」） */
export const SKILL_KEYS = ['q', 'w', 'r', 't'];

export type KeyAction =
  | { type: 'confirm' }
  | { type: 'cancel' }
  | { type: 'index'; index: number }
  | { type: 'end' }
  | { type: 'skill'; index: number }
  | { type: 'nextTarget' }
  | { type: 'help' };

/** 把按键翻译成动作；与输入框、修饰键组合或长按重复的按键一律忽略 */
export function keyAction(e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'repeat'>): KeyAction | null {
  if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return null;
  const key = e.key.toLowerCase();
  if (key === ' ' || key === 'enter') return { type: 'confirm' };
  if (key === 'escape') return { type: 'cancel' };
  if (key === 'e') return { type: 'end' };
  if (key === 'tab') return { type: 'nextTarget' };
  if (key === 'f1' || key === '?') return { type: 'help' };
  const skill = SKILL_KEYS.indexOf(key);
  if (skill >= 0) return { type: 'skill', index: skill };
  const index = keyIndex(key);
  if (index >= 0) return { type: 'index', index };
  return null;
}

/** 监听全局按键；handler 返回 true 表示已处理（会阻止浏览器默认行为） */
export function useHotkeys(handler: (a: KeyAction) => boolean, enabled = true) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const a = keyAction(e);
      if (!a) return;
      // 让焦点离开按钮，避免空格/回车同时「点击」刚才点过的按钮
      if (document.activeElement instanceof HTMLButtonElement) document.activeElement.blur();
      if (ref.current(a)) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}
