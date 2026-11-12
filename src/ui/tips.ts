/**
 * 新手情境提示：某种情况第一次出现时显示一次，记在 localStorage。
 * 判断「当前该显示哪条」是纯函数，便于测试。
 */
import type { GameView, PlayOption, Request, SkillOption } from '../engine/types';

const TIPS_KEY = 'sanguo.tips';

export interface TipState {
  /** 已看过的提示 */
  seen: string[];
  /** 不再显示任何提示 */
  off: boolean;
}

export interface TipContext {
  view: GameView;
  req: Request | null;
  /** 当前选中的出牌 / 技能（用于「选目标」提示） */
  option: PlayOption | null;
  skill: SkillOption | null;
}

export interface TipDef {
  id: string;
  title: string;
  text: string;
  when: (c: TipContext) => boolean;
}

const ROLE_GOAL: Record<string, string> = {
  lord: '你是主公（身份公开）：和忠臣一起消灭所有反贼和内奸。忠臣是谁要靠观察大家的行为判断。',
  loyalist: '你是忠臣：保护主公，消灭反贼和内奸。别人不知道你的身份，主公也不知道。',
  rebel: '你是反贼：和另一名反贼一起击杀主公。',
  renegade: '你是内奸：成为最后唯一存活的角色。先帮弱势的一方，最后和主公单挑。',
};

/** 按优先级排列；同一时刻只显示第一条满足条件且没看过的 */
export const TIPS: TipDef[] = [
  {
    id: 'start',
    title: '对局开始',
    text: '{role} 点座位上的 ⓘ 可以查看武将详情；鼠标移到牌、装备、技能名上会显示说明（手机上长按）。按 F1 或右上角「?」打开规则速查（手机上在右上角「☰」菜单里）。',
    when: (c) => c.view.turn > 0 && !!c.view.players[c.view.me].general,
  },
  {
    id: 'yinren',
    title: '内奸身份技【隐忍】',
    text: '7、8 人局中你（最后存活的内奸）拥有【隐忍】：首次濒死时可以亮出身份、回复至 1 点体力，并防止所有伤害直到你的回合开始。用好这一次免死，熬过主公方与反贼的混战。',
    when: (c) => !!c.view.players[c.view.me].yinren,
  },
  {
    id: 'play',
    title: '出牌阶段',
    text: '点一张亮着的手牌，再点目标座位，然后「确定」（空格）。也可以按数字键选牌。用完牌点「结束出牌」（E）。',
    when: (c) => c.req?.type === 'play',
  },
  {
    id: 'target',
    title: '选择目标',
    text: '只能对攻击范围内的角色使用【斩】——座位上显示了你到他的距离和「可攻击」。可以点座位，也可以按 Tab 切换。',
    when: (c) => c.req?.type === 'play' && !!c.option && c.option.targets.length > 0,
  },
  {
    id: 'skill',
    title: '主动技能',
    text: '你的技能按钮在操作区（快捷键 Q / W）：先点技能，再按提示选牌和目标，最后「确定」。',
    when: (c) => c.req?.type === 'play' && c.req.skills.length > 0,
  },
  {
    id: 'dodge',
    title: '被【斩】了',
    text: '打出【避】可以抵消【斩】；不出就受到 1 点伤害（「不出」或 Esc）。只有一张【避】时已经帮你选好，按空格即可。',
    when: (c) => c.req?.type === 'respond' && c.req.reason.kind === 'dodge',
  },
  {
    id: 'shipo',
    title: '【识破】',
    text: '【识破】可以抵消一张锦囊对一名目标的效果，也能抵消别人的【识破】。延时锦囊要等到目标判定前才能识破。',
    when: (c) => c.req?.type === 'respond' && c.req.reason.kind === 'shipo',
  },
  {
    id: 'save',
    title: '濒死求【药】',
    text: '有角色体力降到 0：大家依次决定是否用【药】救他。救不救由你决定——先想清楚他是敌是友。',
    when: (c) => c.req?.type === 'respond' && c.req.reason.kind === 'save',
  },
  {
    id: 'tianlei',
    title: '【天雷】',
    text: '有人放出了【天雷】：每次轮到持有者都会判定，♠2–9 时受到 3 点伤害；没劈中就传给下家。它会在大家之间转，谁都可能被劈到——落后时它是翻盘的机会。',
    when: (c) => c.view.players.some((p) => p.judge.some((j) => j.card.key === 'tianlei')),
  },
  {
    id: 'judge',
    title: '判定区',
    text: '座位上紫色虚线的「判定：…」是延时锦囊。到他的准备阶段会翻开牌堆顶一张牌判定，按花色决定是否生效；判定前可以用【识破】抵消。',
    when: (c) => c.view.players.some((p) => p.judge.length > 0),
  },
  {
    id: 'discard',
    title: '弃牌阶段',
    text: '手牌数不能超过当前体力：点选要弃置的牌（或按数字键），然后「确定」。',
    when: (c) => c.req?.type === 'discard',
  },
];

type KV = Pick<Storage, 'getItem' | 'setItem'>;

function store(): KV | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function loadTips(s: KV | null = store()): TipState {
  try {
    const raw = s?.getItem(TIPS_KEY);
    if (raw) return { seen: [], off: false, ...JSON.parse(raw) };
  } catch {
    /* 忽略 */
  }
  return { seen: [], off: false };
}

function save(state: TipState, s: KV | null = store()): void {
  s?.setItem(TIPS_KEY, JSON.stringify(state));
}

export function markSeen(id: string): void {
  const t = loadTips();
  if (!t.seen.includes(id)) save({ ...t, seen: [...t.seen, id] });
}

export function setTipsOff(off: boolean): void {
  save({ ...loadTips(), off });
}

/** 重新显示所有提示（同时打开提示） */
export function resetTips(): void {
  save({ seen: [], off: false });
}

/** 当前应显示的提示（没有则 null） */
export function pickTip(c: TipContext, state: TipState): TipDef | null {
  if (state.off) return null;
  return TIPS.find((t) => !state.seen.includes(t.id) && t.when(c)) ?? null;
}

/** 提示文字（替换 {role}） */
export function tipText(t: TipDef, view: GameView): string {
  const role = view.players[view.me].role;
  return t.text.replace('{role}', role ? ROLE_GOAL[role] : '');
}
