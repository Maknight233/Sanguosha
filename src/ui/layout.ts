/**
 * 牌桌座位布局：玩家（0 号位）在下方，其余座位从玩家右手边开始逆时针环绕——
 * 右侧（从下往上）→ 上方（从右往左）→ 左侧（从上往下）。座位的相对位置就是距离关系。
 */
export interface TableSides {
  /** 右侧，从下往上 */
  right: number[];
  /** 上方，从右往左 */
  top: number[];
  /** 左侧，从上往下 */
  left: number[];
}

/** 各人数下右 / 上 / 左三边各放几个座位（不含玩家） */
const SIDE_COUNTS: Record<number, [number, number, number]> = {
  2: [0, 1, 0],
  5: [1, 2, 1],
  6: [1, 3, 1],
  7: [2, 2, 2],
  8: [2, 3, 2],
};

export function tableSides(players: number): TableSides {
  const [r, t] = SIDE_COUNTS[players] ?? [1, players - 3, 1];
  const others = Array.from({ length: players - 1 }, (_, i) => i + 1);
  return { right: others.slice(0, r), top: others.slice(r, r + t), left: others.slice(r + t) };
}

/** 人多时座位卡片更紧凑 */
export const isCrowded = (players: number) => players >= 7;

/** 电脑的显示名 */
const CN = ['一', '二', '三', '四', '五', '六', '七'];
export function seatNames(players: number): string[] {
  return ['你', ...CN.slice(0, players - 1).map((c) => `电脑${c}`)];
}
