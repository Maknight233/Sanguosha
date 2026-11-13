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
    skills: [{ name: '谋算', description: '你受到伤害后，观看牌堆顶 4 张牌，获得其中 1 张，其余以任意顺序放回。' }],
  },
  {
    key: 'zhangliao', name: '张辽', faction: 'wei', hp: 4,
    skills: [{ name: '先登', description: '摸牌阶段你可以少摸 1 张牌，然后本回合你与其他角色的距离视为 1、可以多使用 1 张【斩】，且你的【斩】造成伤害后摸一张牌。' }],
  },
  {
    key: 'liubei', name: '刘备', faction: 'shu', hp: 4,
    skills: [
      { name: '宽仁', description: '出牌阶段限一次，你可以弃置一张手牌，令一名已受伤的其他角色回复 1 点体力。' },
      { name: '桃园', description: '主公技：其他蜀势力角色对你使用【药】时，你额外摸一张牌。', lordSkill: true },
    ],
  },
  {
    key: 'zhugeliang', name: '诸葛亮', faction: 'shu', hp: 4,
    skills: [{ name: '神算', description: '摸牌阶段，你改为观看牌堆顶 3 张牌，获得其中 2 张，另一张置于牌堆底；你使用的锦囊不能被【识破】抵消；你每回合第一次使用锦囊时，摸一张牌。' }],
  },
  {
    key: 'zhaoyun', name: '赵云', faction: 'shu', hp: 4,
    skills: [{ name: '七进', description: '你每回合可以多使用 1 张【斩】。' }],
  },
  {
    key: 'sunquan', name: '孙权', faction: 'wu', hp: 4,
    skills: [
      { name: '坐断', description: '结束阶段，若你的手牌数少于体力值，你摸一张牌。' },
      { name: '江东', description: '主公技：吴势力角色阵亡时，你回复 1 点体力。', lordSkill: true },
    ],
  },
  {
    key: 'zhouyu', name: '周瑜', faction: 'wu', hp: 4,
    skills: [{ name: '火计', description: '出牌阶段限一次，你可以弃置两张同花色手牌，对一名其他角色造成 1 点伤害；若弃置的是红色牌，你摸一张牌。' }],
  },
  {
    key: 'lvbu', name: '吕布', faction: 'qun', hp: 4,
    skills: [{ name: '骁勇', description: '你的攻击范围 +1；你的【斩】造成伤害后，你弃置目标的一张装备牌。' }],
  },
  {
    key: 'diaochan', name: '貂蝉', faction: 'qun', hp: 3,
    skills: [{ name: '惑心', description: '出牌阶段限一次，你选择两名其他角色（后者须在前者攻击范围内），前者须对后者使用一张【斩】，否则交给你一张手牌。' }],
  },
  {
    key: 'simayi', name: '司马懿', faction: 'wei', hp: 3,
    skills: [{ name: '韬晦', description: '结束阶段，若本回合你没有对其他角色造成过伤害，你摸两张牌（若你的手牌数不小于体力，改为摸一张）。' }],
  },
  {
    key: 'guanyu', name: '关羽', faction: 'shu', hp: 4,
    skills: [{ name: '过关', description: '存活角色不多于 3 人时，你摸牌阶段多摸 1 张牌，且每回合可以多使用 1 张【斩】。' }],
  },
  {
    key: 'luxun', name: '陆逊', faction: 'wu', hp: 4,
    skills: [{ name: '持重', description: '你的回合外，你每打出一张【避】，摸一张牌。' }],
  },
  {
    key: 'ganning', name: '甘宁', faction: 'wu', hp: 4,
    skills: [{ name: '锦帆', description: '你的【斩】造成伤害后，你可以随机获得目标的一张手牌。' }],
  },
  {
    key: 'huatuo', name: '华佗', faction: 'qun', hp: 4,
    skills: [{ name: '养生', description: '准备阶段，若你已受伤，你可以弃置一张手牌，回复 1 点体力，然后若你的体力不大于 2 且弃置的不是【药】，摸一张牌。' }],
  },
  {
    key: 'zhangjiao', name: '张角', faction: 'qun', hp: 4,
    skills: [{ name: '聚众', description: '其他角色阵亡后，你增加 1 点体力上限并回复 1 点体力（每局最多因此增加 2 点上限）。' }],
  },
  // 第三批：每人带一种新机制
  {
    key: 'dianwei', name: '典韦', faction: 'wei', hp: 4,
    skills: [{ name: '舍身', description: '每回合限一次，与你距离为 1 的其他角色受到伤害时，你可以代替其承受此伤害，然后摸两张牌。' }],
  },
  {
    key: 'huangzhong', name: '黄忠', faction: 'shu', hp: 4,
    skills: [{ name: '宝刀', description: '你使用【斩】无视距离；你可以将手牌中的装备牌当作【斩】使用或打出。' }],
  },
  {
    key: 'lusu', name: '鲁肃', faction: 'wu', hp: 3,
    skills: [{ name: '联盟', description: '出牌阶段限一次，你可以交给一名其他角色一张手牌，然后你摸一张牌。' }],
  },
  {
    key: 'dongzhuo', name: '董卓', faction: 'qun', hp: 5,
    skills: [{ name: '焚城', description: '限定技（每局限一次），出牌阶段，你可以对所有其他角色各造成 1 点伤害，然后你失去 1 点体力。' }],
  },
  // 第四批（判定）
  {
    key: 'xunyu', name: '荀彧', faction: 'wei', hp: 4,
    skills: [{ name: '定策', description: '一名角色的判定牌生效前，你可以打出一张手牌代替之，然后摸一张牌。' }],
  },
  {
    key: 'weiyan', name: '魏延', faction: 'shu', hp: 4,
    skills: [{ name: '奇袭', description: '出牌阶段限一次，你可以进行判定：若为黑色，你可以视为对距离为 1 的一名其他角色使用一张【斩】（不计入次数）。' }],
  },
  {
    key: 'lvmeng', name: '吕蒙', faction: 'wu', hp: 4,
    skills: [{ name: '渡江', description: '出牌阶段限一次，你可以将一张 ♦ 手牌当【断粮】使用（不受距离限制），然后摸一张牌。' }],
  },
  {
    key: 'yuji', name: '于吉', faction: 'qun', hp: 4,
    skills: [{ name: '卜筮', description: '每轮限一次（你的回合开始时重置），其他角色的判定牌生效后，你可以获得之。' }],
  },
  // 第五批：装备（2026-11-10）
  {
    key: 'caoren', name: '曹仁', faction: 'wei', hp: 4,
    skills: [{ name: '坚城', description: '结束阶段，若你装备区的牌数不少于 2，摸一张牌。' }],
  },
  {
    key: 'zhangfei', name: '张飞', faction: 'shu', hp: 4,
    skills: [{ name: '夺械', description: '出牌阶段限一次，你可以获得距离 1 以内一名其他角色装备区的一张牌，然后该角色摸一张牌。' }],
  },
  {
    key: 'taishici', name: '太史慈', faction: 'wu', hp: 4,
    skills: [{ name: '死战', description: '你可以将装备区的一张牌当【避】打出，然后摸一张牌。' }],
  },
  {
    key: 'gongsunzan', name: '公孙瓒', faction: 'qun', hp: 4,
    skills: [{ name: '白马', description: '你使用装备牌时，摸一张牌；你的装备区有坐骑时，攻击范围 +1。' }],
  },
  // 第六批：受伤触发（2026-11-11）
  {
    key: 'xiahoudun', name: '夏侯惇', faction: 'wei', hp: 4,
    skills: [{ name: '拔矢', description: '每回合限一次，你受到其他角色造成的伤害后，可以弃置一张手牌，对伤害来源造成 1 点伤害。' }],
  },
  {
    key: 'machao', name: '马超', faction: 'shu', hp: 4,
    skills: [{ name: '怒袭', description: '你受到伤害后，获得 1 枚「怒」（至多 1 枚）；你使用【斩】时若有「怒」，弃置之，此【斩】伤害 +1。' }],
  },
  {
    key: 'zhoutai', name: '周泰', faction: 'wu', hp: 4,
    skills: [{ name: '坚韧', description: '你受到伤害后，若你的体力不大于 2，摸两张牌。' }],
  },
  {
    key: 'huaxiong', name: '华雄', faction: 'qun', hp: 4,
    skills: [{ name: '恃勇', description: '锁定技，你受到伤害后，若伤害来源的手牌比你多，你随机获得其一张手牌。' }],
  },
  // ───── 第七批：救援与回复 ─────
  {
    key: 'caiwenji', name: '蔡文姬', faction: 'qun', hp: 4,
    skills: [{ name: '清音', description: '每回合限一次，其他角色（主公除外）进入濒死状态时，你可以弃置一张手牌，令其回复 1 点体力，然后你摸一张牌。' }],
  },
  {
    key: 'daqiao', name: '大乔', faction: 'wu', hp: 4,
    skills: [{ name: '抚伤', description: '出牌阶段限一次，你可以交给一名已受伤的其他角色（主公除外）两张手牌，令其回复 1 点体力，然后你摸一张牌。' }],
  },
  {
    key: 'mizhu', name: '糜竺', faction: 'shu', hp: 4,
    skills: [{ name: '济困', description: '出牌阶段，你可以对一名已受伤的其他角色（主公除外）使用【药】。你使用【药】令其他角色（主公除外）回复体力后，摸两张牌；令自己回复体力后，摸一张牌。' }],
  },
  {
    key: 'pangde', name: '庞德', faction: 'wei', hp: 5,
    skills: [{ name: '抬榇', description: '锁定技，你脱离濒死状态后，摸三张牌。' }],
  },
  // ───── 第八批：拼点 ─────
  {
    key: 'xuchu', name: '许褚', faction: 'wei', hp: 4,
    skills: [{ name: '搏虎', description: '出牌阶段限一次，你可以与攻击范围内一名角色拼点：若你赢，你对其造成 1 点伤害；若你没赢，本回合你不能再使用【斩】。' }],
  },
  {
    key: 'fazheng', name: '法正', faction: 'shu', hp: 3,
    skills: [{ name: '奇谋', description: '出牌阶段限一次，你可以与一名其他角色拼点：若你赢，你获得双方的拼点牌。' }],
  },
  {
    key: 'chengpu', name: '程普', faction: 'wu', hp: 4,
    skills: [{ name: '老将', description: '你的拼点牌点数 +2（最多算 K）。出牌阶段限一次，你可以与一名其他角色拼点：若你赢，你弃置其一张牌。' }],
  },
  {
    key: 'jiaxu', name: '贾诩', faction: 'qun', hp: 3,
    skills: [{ name: '乱策', description: '出牌阶段限一次，你可以弃置一张手牌，令两名有手牌的其他角色拼点（先选的一方为发起者），赢的一方视为对没赢的一方使用一张【斩】（不计入次数）。' }],
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
