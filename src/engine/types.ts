export type Suit = 'spade' | 'heart' | 'club' | 'diamond';
export type Role = 'lord' | 'loyalist' | 'rebel' | 'renegade';
export type Faction = 'wei' | 'shu' | 'wu' | 'qun';
export type EquipSlot = 'weapon' | 'armor' | 'horseMinus' | 'horsePlus';
export type CardKind = 'basic' | 'trick' | 'equip';
export type Phase = 'setup' | 'prepare' | 'draw' | 'play' | 'discard' | 'end' | 'over';
/** 获胜阵营：lord 表示主公与忠臣 */
export type Winner = 'lord' | 'rebel' | 'renegade';

export interface Card {
  id: number;
  key: string;
  suit: Suit;
  rank: number; // 1-13
}

export interface Player {
  seat: number;
  name: string;
  general: string;
  role: Role;
  hp: number;
  maxHp: number;
  hand: Card[];
  equips: Partial<Record<EquipSlot, Card>>;
  alive: boolean;
}

/** 某个玩家能看到的其他角色信息 */
export interface PlayerPublic {
  seat: number;
  name: string;
  general: string;
  /** 只有自己、主公、已阵亡角色的身份可见 */
  role: Role | null;
  hp: number;
  maxHp: number;
  alive: boolean;
  handCount: number;
  equips: Partial<Record<EquipSlot, Card>>;
  /** 仅自己可见 */
  hand: Card[] | null;
}

export interface GameView {
  me: number;
  current: number;
  phase: Phase;
  turn: number;
  drawPileCount: number;
  discardPileCount: number;
  players: PlayerPublic[];
  zhanUsed: number;
  zhanLimit: number;
  /** 公开的敌对行为记录：hostility[a][b] = a 对 b 发起指向性攻击的累计分量 */
  hostility: number[][];
  /** 公开的帮助行为记录：help[a][b] = a 帮助 b（救人、回血、替人挡锦囊等）的累计分量 */
  help: number[][];
  /** 阵亡顺序（座位号），公开信息 */
  deathOrder: number[];
}

export interface PlayOption {
  cardId: number;
  /** 可选目标；空数组表示无需指定目标 */
  targets: number[];
  /** 镔铁大戟：主目标 → 可额外指定的目标 */
  extraTargets?: Record<number, number[]>;
}

/** 出牌阶段可发动的主动技能 */
export interface SkillOption {
  skill: 'kuanren' | 'huoji' | 'huoxin';
  /** 需要弃置/使用的手牌张数 */
  cardCount: number;
  /** 第一目标候选 */
  targets: number[];
  /** 惑心：第一目标 → 第二目标候选 */
  secondTargets?: Record<number, number[]>;
}

export type PlayAction =
  | { type: 'end' }
  | { type: 'use'; cardId: number; target?: number; extraTarget?: number }
  | { type: 'skill'; skill: SkillOption['skill']; cards: number[]; targets: number[] };

export type RespondReason =
  | { kind: 'dodge'; source: number }
  | { kind: 'save'; dying: number }
  /** countering=true 表示要抵消的是一张【识破】 */
  | { kind: 'shipo'; trick: string; user: number; target: number; countering: boolean }
  | { kind: 'xiwen'; source: number }
  | { kind: 'biwu'; opponent: number }
  | { kind: 'yulin'; source: number | null }
  /** 号令：替主公打出【避】 */
  | { kind: 'haoling'; lord: number; source: number }
  /** 惑心：须对 victim 使用【斩】，否则交给 from 一张手牌 */
  | { kind: 'huoxin'; victim: number; from: number };

export type ChooseReason = 'xiuzheng' | 'xiandeng' | 'jinfan' | 'yangsheng';

export interface ChoiceOption {
  id: string;
  label: string;
}

export type Request =
  | { type: 'chooseGeneral'; options: string[] }
  | { type: 'play'; options: PlayOption[]; skills: SkillOption[] }
  /** allowPair：可用两张同颜色手牌代替（铁脊长枪） */
  | { type: 'respond'; accept: string[]; reason: RespondReason; allowPair?: boolean }
  | { type: 'discard'; count: number }
  /** 从目标区域选一张牌：手牌随机抽取，装备可指定 */
  | { type: 'chooseCard'; target: number; handCount: number; equips: Card[]; reason: 'jieying' | 'cefan' }
  /** 养生的选项 id 为要弃置的手牌 id（字符串），'no' 表示不发动 */
  | { type: 'choose'; options: ChoiceOption[]; reason: ChooseReason }
  /** 从给定牌中选出 count 张 */
  | { type: 'selectCards'; cards: Card[]; count: number; reason: 'mousuan' | 'shensuan' | 'xiaoyong' | 'huoxin' }
  /** 将牌排序放回牌堆顶，返回的第一张在最上面 */
  | { type: 'orderCards'; cards: Card[]; reason: 'mousuan' };

export type CardPick = { zone: 'hand' } | { zone: 'equip'; cardId: number };

export interface ResponseMap {
  chooseGeneral: string;
  play: PlayAction;
  respond: number | [number, number] | null;
  discard: number[];
  chooseCard: CardPick;
  choose: string;
  selectCards: number[];
  orderCards: number[];
}

export type Response<R extends Request> = ResponseMap[R['type']];

/** 玩家控制器：人类（界面）与 AI 实现同一接口 */
export interface Controller {
  decide<R extends Request>(view: GameView, req: R): Promise<Response<R>>;
}

/** 日志附带的结构化事件，供界面做动画与出牌区展示（不影响规则） */
export type LogEvent =
  | { type: 'turn'; seat: number }
  /**
   * 使用 / 打出牌或发动技能；to 为指向的角色（可为空），skill 为技能名。
   * start 为 true 表示一次新结算的开始（之后的响应牌都属于这次结算）。
   */
  | { type: 'use'; from: number; to: number[]; cards: Card[]; skill?: string; start?: true }
  | { type: 'discard'; from: number; cards: Card[]; start?: true }
  | { type: 'damage'; seat: number; amount: number; from: number | null }
  | { type: 'recover'; seat: number; amount: number }
  | { type: 'dying'; seat: number }
  | { type: 'death'; seat: number };

export interface LogEntry {
  turn: number;
  text: string;
  event?: LogEvent;
}
