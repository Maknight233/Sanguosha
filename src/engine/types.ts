export type Suit = 'spade' | 'heart' | 'club' | 'diamond';
export type Role = 'lord' | 'loyalist' | 'rebel' | 'renegade';
export type Faction = 'wei' | 'shu' | 'wu' | 'qun';
export type EquipSlot = 'weapon' | 'armor' | 'horseMinus' | 'horsePlus';
export type CardKind = 'basic' | 'trick' | 'equip';
export type Phase = 'setup' | 'prepare' | 'draw' | 'play' | 'discard' | 'end' | 'over';
/** 获胜阵营：lord 表示主公与忠臣 */
/** draw：平局（牌堆被摸光的次数达到上限） */
export type Winner = 'lord' | 'rebel' | 'renegade' | 'draw';

export interface Card {
  id: number;
  key: string;
  suit: Suit;
  rank: number; // 1-13
}

/** 判定区中的延时锦囊；from 为使用者 */
export interface JudgeCard {
  card: Card;
  from: number;
  /** 当作哪种延时锦囊（吕蒙【渡江】把 ♦ 牌当【断粮】）；不填则为牌本身 */
  as?: string;
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
  /** 判定区，按放入顺序 */
  judge: JudgeCard[];
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
  /** 判定区（公开） */
  judge: JudgeCard[];
  /** 仅自己可见 */
  hand: Card[] | null;
  /** 【隐忍】剩余强化次数（公开） */
  empower?: number;
  /** 本局受到过的伤害（公开信息） */
  damageTaken?: number;
  /** 【隐忍】免伤中 */
  shielded?: boolean;
  /** 拥有尚未发动的【隐忍】（只有自己可见） */
  yinren?: boolean;
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
  /** 牌堆已被摸光的次数（达到 DRAW_GAME_PILES 时平局） */
  pileExhausted: number;
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
  skill: 'kuanren' | 'huoji' | 'huoxin' | 'baodao' | 'lianmeng' | 'fencheng' | 'qixi' | 'dujiang' | 'duoxie' | 'yinrenDraw' | 'yinrenHit' | 'fushang' | 'jikun' | 'bohu' | 'qimou' | 'laojiang' | 'luance';
  /** 需要弃置/使用的手牌张数 */
  cardCount: number;
  /** 第一目标候选；空数组表示无需指定目标（如焚城） */
  targets: number[];
  /** 惑心 / 乱策：第一目标 → 第二目标候选 */
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
  /** trickId：被询问的锦囊牌 id；group：是否为对多名角色使用的群体锦囊（檄文、休整） */
  | { kind: 'shipo'; trick: string; user: number; target: number; countering: boolean; trickId?: number; group?: boolean }
  | { kind: 'xiwen'; source: number }
  | { kind: 'biwu'; opponent: number }
  | { kind: 'yulin'; source: number | null }
  /** 号令：替主公打出【避】 */
  | { kind: 'haoling'; lord: number; source: number }
  /** 惑心：须对 victim 使用【斩】，否则交给 from 一张手牌 */
  | { kind: 'huoxin'; victim: number; from: number };

export type ChooseReason = 'xiuzheng' | 'xiandeng' | 'jinfan' | 'yangsheng' | 'sheshen' | 'dingce' | 'bushi' | 'qixi' | 'liuxing' | 'yinren' | 'bashi' | 'qingyin';

/** 判定的内容：延时锦囊的牌名，或 'qixi'（魏延【奇袭】） */
export interface JudgeInfo {
  /** 进行判定的角色 */
  seat: number;
  what: string;
  /** 当前判定牌 */
  result: Card;
}

export interface ChoiceOption {
  id: string;
  label: string;
}

export type Request =
  | { type: 'chooseGeneral'; options: string[] }
  | { type: 'play'; options: PlayOption[]; skills: SkillOption[] }
  /** allowPair：可用两张同颜色手牌代替（铁脊长枪）；equipDodge：可当【避】打出的装备区的牌（太史慈【死战】），回答其 id */
  | { type: 'respond'; accept: string[]; reason: RespondReason; allowPair?: boolean; equipDodge?: Card[] }
  | { type: 'discard'; count: number }
  /** 从目标区域选一张牌：手牌随机抽取，装备可指定 */
  | { type: 'chooseCard'; target: number; handCount: number; equips: Card[]; reason: 'jieying' | 'cefan' | 'liuxing' | 'laojiang' }
  /** 养生的选项 id 为要弃置的手牌 id（字符串），'no' 表示不发动 */
  /** target / amount：舍身时为将受到伤害的角色与伤害值 */
  /** judge：定策 / 卜筮时为当前判定 */
  | { type: 'choose'; options: ChoiceOption[]; reason: ChooseReason; target?: number; amount?: number; judge?: JudgeInfo }
  /** 从给定牌中选出 count 张 */
  /** pindian：拼点时选一张手牌；附带对手、是否为发起者、技能名 */
  | { type: 'selectCards'; cards: Card[]; count: number; reason: 'mousuan' | 'shensuan' | 'xiaoyong' | 'huoxin' | 'duoxie' | 'pindian'; pindian?: PindianInfo }
  /** 将牌排序放回牌堆顶，返回的第一张在最上面 */
  | { type: 'orderCards'; cards: Card[]; reason: 'mousuan' }
  /** 刷牌：开局发完起始手牌后询问，回答 true 刷新全部手牌（可反复），false 开始游戏 */
  | { type: 'mulligan' };

/** 拼点请求的上下文 */
export interface PindianInfo {
  /** 拼点对手 */
  opponent: number;
  /** 自己是否为发起者（平局算发起者输） */
  initiator: boolean;
  /** 发起拼点的技能：bohu / qimou / laojiang / luance */
  skill: string;
  /** 乱策时的技能使用者（贾诩） */
  by: number;
}

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
  mulligan: boolean;
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
  /** 判定：seat 进行判定（what 为延时锦囊牌名或 'qixi'，trick 为延时锦囊），结果为 result；effective 为是否生效（奇袭为是否黑色） */
  | { type: 'judge'; seat: number; what: string; trick?: Card; result: Card; effective: boolean }
  | { type: 'death'; seat: number }
  /** 拼点：from 为发起者；win 为发起者是否赢；ranks 为计入加成后的点数 */
  | { type: 'pindian'; from: number; to: number; cards: [Card, Card]; ranks: [number, number]; win: boolean };

export interface LogEntry {
  turn: number;
  text: string;
  event?: LogEvent;
}
