import type { Faction } from '../engine/types';

export interface SkillDef {
  name: string;
  description: string;
  lordSkill?: boolean;
}

export interface GeneralDef {
  key: string;
  name: string;
  faction: Faction;
  hp: number;
  skills: SkillDef[];
  /** 预留立绘图片路径 */
  image?: string;
}

const defs: GeneralDef[] = [
  {
    key: 'caocao', name: '曹操', faction: 'wei', hp: 4,
    skills: [
      { name: '霸业', description: '你造成伤害后，摸一张牌。' },
      { name: '号令', description: '主公技：你需要打出【避】而未打出时，其他魏势力角色可以替你打出。', lordSkill: true },
    ],
  },
  {
    key: 'guojia', name: '郭嘉', faction: 'wei', hp: 3,
    skills: [{ name: '谋算', description: '你受到伤害后，观看牌堆顶 3 张牌，获得其中 1 张，其余以任意顺序放回。' }],
  },
  {
    key: 'zhangliao', name: '张辽', faction: 'wei', hp: 4,
    skills: [{ name: '先登', description: '摸牌阶段你可以少摸 1 张牌，然后本回合你与其他角色的距离视为 1。' }],
  },
  {
    key: 'liubei', name: '刘备', faction: 'shu', hp: 4,
    skills: [
      { name: '宽仁', description: '出牌阶段限一次，你可以弃置两张手牌，令一名已受伤的角色回复 1 点体力；其他角色回复体力时，你摸一张牌。' },
      { name: '桃园', description: '主公技：其他蜀势力角色对你使用【药】时，你额外摸一张牌。', lordSkill: true },
    ],
  },
  {
    key: 'zhugeliang', name: '诸葛亮', faction: 'shu', hp: 3,
    skills: [{ name: '神算', description: '摸牌阶段，你改为观看牌堆顶 3 张牌，获得其中 2 张，另一张置于牌堆底；你使用的锦囊不能被【识破】抵消。' }],
  },
  {
    key: 'zhaoyun', name: '赵云', faction: 'shu', hp: 4,
    skills: [{ name: '七进', description: '你每回合可以多使用 1 张【斩】；你的【斩】被【避】抵消后，你摸一张牌。' }],
  },
  {
    key: 'sunquan', name: '孙权', faction: 'wu', hp: 4,
    skills: [
      { name: '坐断', description: '结束阶段，若你的手牌数少于体力值，你将手牌摸至体力值。' },
      { name: '江东', description: '主公技：吴势力角色阵亡时，你回复 1 点体力。', lordSkill: true },
    ],
  },
  {
    key: 'zhouyu', name: '周瑜', faction: 'wu', hp: 3,
    skills: [{ name: '火计', description: '出牌阶段限一次，你可以弃置两张同花色手牌，对一名其他角色造成 1 点伤害。' }],
  },
  {
    key: 'lvbu', name: '吕布', faction: 'qun', hp: 4,
    skills: [{ name: '骁勇', description: '你的攻击范围 +1；你的【斩】造成伤害后，你弃置目标的一张装备牌。' }],
  },
  {
    key: 'diaochan', name: '貂蝉', faction: 'qun', hp: 3,
    skills: [{ name: '惑心', description: '出牌阶段限一次，你选择两名其他角色（后者须在前者攻击范围内），前者须对后者使用一张【斩】，否则交给你一张手牌。' }],
  },
];

export const GENERALS: Record<string, GeneralDef> = Object.fromEntries(defs.map((g) => [g.key, g]));
export const GENERAL_KEYS: string[] = defs.map((g) => g.key);

export function generalDef(key: string): GeneralDef {
  const g = GENERALS[key];
  if (!g) throw new Error(`未知武将: ${key}`);
  return g;
}

export const FACTION_NAME: Record<Faction, string> = { wei: '魏', shu: '蜀', wu: '吴', qun: '群' };
