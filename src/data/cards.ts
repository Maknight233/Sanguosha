import type { Card, CardKind, EquipSlot, Suit } from '../engine/types';

export interface CardDef {
  key: string;
  name: string;
  kind: CardKind;
  slot?: EquipSlot;
  /** 武器攻击范围 */
  range?: number;
  description: string;
  /** 延时锦囊：使用后置于目标判定区，目标准备阶段判定 */
  delayed?: boolean;
  /** 预留卡面图片路径 */
  image?: string;
}

const defs: CardDef[] = [
  // 基础牌
  { key: 'zhan', name: '斩', kind: 'basic', description: '出牌阶段限一次，对攻击范围内一名其他角色使用，目标需打出【避】，否则受到 1 点伤害。' },
  { key: 'bi', name: '避', kind: 'basic', description: '抵消一张对你使用的【斩】。' },
  { key: 'yao', name: '药', kind: 'basic', description: '出牌阶段回复 1 点体力；或在一名角色濒死时对其使用，令其回复 1 点体力。' },

  // 锦囊牌
  { key: 'tiaobing', name: '调兵', kind: 'trick', description: '出牌阶段对自己使用，摸两张牌。' },
  { key: 'jieying', name: '劫营', kind: 'trick', description: '出牌阶段对一名有牌的其他角色使用，弃置其一张牌（手牌随机，装备可指定）。' },
  { key: 'cefan', name: '策反', kind: 'trick', description: '出牌阶段对距离 1 以内一名有牌的其他角色使用，获得其一张牌（手牌随机，装备可指定）。' },
  { key: 'xiwen', name: '檄文', kind: 'trick', description: '出牌阶段对所有其他角色使用，每名目标需弃置一张基础牌，否则受到你造成的 1 点伤害。' },
  { key: 'biwu', name: '比武', kind: 'trick', description: '出牌阶段对一名其他角色使用，由目标开始双方轮流弃置一张【斩】，先不弃置的一方受到对方造成的 1 点伤害。' },
  { key: 'xiuzheng', name: '休整', kind: 'trick', description: '出牌阶段对所有角色使用，每名角色依次选择回复 1 点体力或摸一张牌。' },
  { key: 'duanliang', name: '断粮', kind: 'trick', delayed: true, description: '延时锦囊。出牌阶段对距离 1 以内的一名其他角色使用，置于其判定区。其准备阶段判定：若结果不为 ♣，其本回合摸牌阶段少摸 1 张牌。' },
  { key: 'junling', name: '军令', kind: 'trick', delayed: true, description: '延时锦囊。出牌阶段对一名其他角色使用，置于其判定区。其准备阶段判定：若结果为黑色（♠♣），其本回合不能使用【斩】。' },
  { key: 'tianlei', name: '天雷', kind: 'trick', delayed: true, description: '延时锦囊。出牌阶段对自己使用，置于你的判定区（判定区已有【天雷】时不能使用）。你的准备阶段判定：若结果为 ♠2–9，你受到 3 点伤害（无来源），然后弃置【天雷】；否则将它移至下家的判定区（跳过已有【天雷】的角色）。被【识破】抵消时同样移至下家。' },
  { key: 'shipo', name: '识破', kind: 'trick', description: '在锦囊牌对一名目标生效前打出，抵消其对该目标的效果；也可以抵消另一张【识破】。' },

  // 武器
  { key: 'huanshoudao', name: '环首刀', kind: 'equip', slot: 'weapon', range: 2, description: '武器，攻击范围 2。你的【斩】结算完毕后，若目标手牌比你多，你摸一张牌。' },
  { key: 'tiejiqiang', name: '铁脊长枪', kind: 'equip', slot: 'weapon', range: 3, description: '武器，攻击范围 3。你可以将两张同颜色手牌当作【避】打出。' },
  { key: 'bintieji', name: '镔铁大戟', kind: 'equip', slot: 'weapon', range: 3, description: '武器，攻击范围 3。你使用【斩】时，可以额外指定与原目标相邻的一名角色为目标。' },
  { key: 'liuxingchui', name: '流星锤', kind: 'equip', slot: 'weapon', range: 2, description: '武器，攻击范围 2。你的【斩】被【避】抵消后，你可以弃置一张手牌，令目标弃置一张牌（手牌随机，装备由你指定）。' },
  { key: 'shenbigong', name: '神臂弓', kind: 'equip', slot: 'weapon', range: 4, description: '武器，攻击范围 4。你不能对距离为 1 的角色使用【斩】。' },

  // 防具
  { key: 'yulinjia', name: '鱼鳞甲', kind: 'equip', slot: 'armor', description: '防具。每回合你第一次受到【斩】造成的伤害时，可以弃置一张基础牌防止此伤害。' },
  { key: 'suozijia', name: '锁子甲', kind: 'equip', slot: 'armor', description: '防具。伤害来源与你的距离不小于 2 时，【斩】对你造成的伤害 -1。' },
  { key: 'shoumiandun', name: '兽面盾', kind: 'equip', slot: 'armor', description: '防具。你成为【劫营】或【策反】的目标时进行判定：若结果为红色，此牌对你无效。' },
  { key: 'huxinjing', name: '护心镜', kind: 'equip', slot: 'armor', description: '防具。你的体力为 1 时受到伤害，此伤害 -1，然后弃置【护心镜】。' },

  // 坐骑
  { key: 'qiji', name: '骐骥', kind: 'equip', slot: 'horseMinus', description: '进攻马：你与其他角色的距离 -1。' },
  { key: 'hualiu', name: '骅骝', kind: 'equip', slot: 'horseMinus', description: '进攻马：你与其他角色的距离 -1。' },
  { key: 'qingcong', name: '青骢', kind: 'equip', slot: 'horsePlus', description: '防御马：其他角色与你的距离 +1。' },
  { key: 'huangbiao', name: '黄骠', kind: 'equip', slot: 'horsePlus', description: '防御马：其他角色与你的距离 +1。' },
];

export const CARD_DEFS: Record<string, CardDef> = Object.fromEntries(defs.map((d) => [d.key, d]));

export function cardDef(key: string): CardDef {
  const d = CARD_DEFS[key];
  if (!d) throw new Error(`未知卡牌: ${key}`);
  return d;
}

/** 牌堆构成，共 89 张（新牌放在末尾，原有牌的花色点数不变） */
export const DECK_SPEC: Array<{ key: string; count: number }> = [
  { key: 'zhan', count: 31 },
  { key: 'bi', count: 12 },
  { key: 'yao', count: 6 },
  { key: 'tiaobing', count: 4 },
  { key: 'jieying', count: 4 },
  { key: 'cefan', count: 3 },
  { key: 'xiwen', count: 2 },
  { key: 'biwu', count: 3 },
  { key: 'xiuzheng', count: 1 },
  { key: 'shipo', count: 4 },
  { key: 'duanliang', count: 2 },
  { key: 'junling', count: 2 },
  { key: 'huanshoudao', count: 1 },
  { key: 'tiejiqiang', count: 1 },
  { key: 'bintieji', count: 1 },
  { key: 'shenbigong', count: 1 },
  { key: 'yulinjia', count: 1 },
  { key: 'huxinjing', count: 1 },
  { key: 'qiji', count: 1 },
  { key: 'hualiu', count: 1 },
  { key: 'qingcong', count: 1 },
  { key: 'huangbiao', count: 1 },
  { key: 'tianlei', count: 2 },
  { key: 'suozijia', count: 1 },
  { key: 'shoumiandun', count: 1 },
  { key: 'liuxingchui', count: 1 },
];

const SUITS: Suit[] = ['spade', 'heart', 'club', 'diamond'];

/** 生成未洗的牌堆；花色与点数按固定规律分配，保证每次一致 */
export function buildDeck(): Card[] {
  const cards: Card[] = [];
  let i = 0;
  for (const { key, count } of DECK_SPEC) {
    for (let c = 0; c < count; c++) {
      cards.push({ id: i, key, suit: SUITS[i % 4], rank: (i % 13) + 1 });
      i++;
    }
  }
  return cards;
}

export const SUIT_SYMBOL: Record<Suit, string> = { spade: '♠', heart: '♥', club: '♣', diamond: '♦' };
const RANK_TEXT = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export function cardText(card: Card): string {
  return `${SUIT_SYMBOL[card.suit]}${RANK_TEXT[card.rank]}【${cardDef(card.key).name}】`;
}

export const BASIC_KEYS = ['zhan', 'bi', 'yao'];

/** 【天雷】参数（模拟脚本可修改来对比） */
export const TIANLEI_TUNING = { maxRank: 9 };

/** 【天雷】劈中：判定结果为 ♠2–9 */
export function tianleiHit(card: Card): boolean {
  return card.suit === 'spade' && card.rank >= 2 && card.rank <= TIANLEI_TUNING.maxRank;
}

/** 【天雷】伤害 */
export const TIANLEI_DAMAGE = 3;

export function isRed(card: Card): boolean {
  return card.suit === 'heart' || card.suit === 'diamond';
}
