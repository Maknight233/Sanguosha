import { BASIC_KEYS, buildDeck, cardDef, cardText, isRed, TIANLEI_DAMAGE, tianleiHit } from '../data/cards';
import { GENERAL_KEYS, generalDef } from '../data/generals';
import { Rng } from './rng';
import type {
  Card,
  CardPick,
  Controller,
  EquipSlot,
  GameView,
  LogEntry,
  LogEvent,
  Phase,
  PlayAction,
  PlayOption,
  Player,
  Request,
  JudgeInfo,
  RespondReason,
  Response,
  Role,
  SkillOption,
  Winner,
} from './types';

export const ROLE_NAME: Record<Role, string> = {
  lord: '主公',
  loyalist: '忠臣',
  rebel: '反贼',
  renegade: '内奸',
};

export const WINNER_NAME: Record<Winner, string> = {
  lord: '主公与忠臣',
  rebel: '反贼',
  renegade: '内奸',
};

/**
 * 各人数的身份配置：主公方与反贼人数相等时最平衡，所以 6、8 人用 2 名内奸
 * （两名内奸互为敌人，只有最后存活的那名获胜）。
 */
export const ROLE_TABLE: Record<number, Role[]> = {
  5: ['lord', 'loyalist', 'rebel', 'rebel', 'renegade'],
  6: ['lord', 'loyalist', 'rebel', 'rebel', 'renegade', 'renegade'],
  7: ['lord', 'loyalist', 'loyalist', 'rebel', 'rebel', 'rebel', 'renegade'],
  8: ['lord', 'loyalist', 'loyalist', 'rebel', 'rebel', 'rebel', 'renegade', 'renegade'],
};
/** 各人数的主公体力上限加成 */
export const LORD_BONUS: Record<number, number> = { 5: 1, 6: 1, 7: 0, 8: 0 };

/** 某角色是否属于获胜方（内奸获胜时只有存活的那名内奸算赢） */
export function isWinner(p: Pick<Player, 'role' | 'alive'>, winner: Winner): boolean {
  if (winner === 'lord') return p.role === 'lord' || p.role === 'loyalist';
  if (winner === 'renegade') return p.role === 'renegade' && p.alive;
  return p.role === winner;
}
export const PLAYER_COUNTS = [5, 6, 7, 8];
/** 内奸身份技【隐忍】生效的人数（7、8 人局；平衡测试可改） */
export const YINREN_PLAYERS = new Set([7, 8]);
/** 【隐忍】摸牌数上限 / 伤害值 */
export const YINREN_DRAW_MAX = 4;
export const YINREN_DAMAGE = 2;
export const YINREN_TEXT = `内奸身份技（仅 7、8 人局；有 2 名内奸时，另一名阵亡后才获得），每局限一次，以下二选一：① 保命：获得此技能后首次进入濒死状态时，你可以亮出身份，将体力回复至 1 点，然后防止你受到的所有伤害，直到你的回合开始；② 主动：出牌阶段，你可以亮出身份并选择一项：摸 X 张牌（X 为你本局受到过的伤害，至多 ${YINREN_DRAW_MAX}），之后你使用或打出的 X 张牌（含虚拟牌）伤害 / 回复值 +1；或对一名其他角色造成 ${YINREN_DAMAGE} 点伤害，其本回合不能使用或打出牌。主动发动后失去保命效果；不发动保命也会失去此技能。`;
export const STANDARD_ROLES: Role[] = ROLE_TABLE[5];
export const INITIAL_HAND = 4;
export const DRAW_PER_TURN = 2;
/** 主公候选武将数 / 其他人候选武将数 */
const LORD_CHOICES = 3;
const OTHER_CHOICES = 2;

/** 司马懿【韬晦】摸牌数 */
export const TAOHUI_DRAW = 2;
/** 张角【聚众】最多增加的体力上限 */
export const JUZHONG_MAX = 2;

/** 公开敌对行为的分量（AI 身份推理用） */
export const HOSTILE_WEIGHT = {
  /** 【斩】、火计、比武、惑心发起者 */
  zhan: 1,
  /** 劫营、策反：只是拆牌 */
  steal: 0.6,
  /** 断粮、军令：延时锦囊 */
  delay: 0.6,
  /** 被惑心逼出的【斩】 */
  forced: 0.5,
};

/** 公开帮助行为的分量 */
export const HELP_WEIGHT = {
  /** 濒死时对别人使用【药】 */
  save: 1.5,
  /** 宽仁令别人回复体力 */
  heal: 1,
  /** 用【识破】替别人挡掉有害锦囊、号令替主公出【避】 */
  cover: 1,
  /** 舍身：替别人承受伤害 */
  protect: 1.5,
  /** 联盟：交给别人一张手牌 */
  gift: 0.6,
};

/** 典韦【舍身】摸牌数 */
export const SHESHEN_DRAW = 2;
/** 曹仁【坚城】：摸牌数 = 装备区牌数 − 此值 */
export const JIANCHENG_FREE = 1;
/** 张飞【夺械】：被夺者摸牌数 */
export const DUOXIE_DRAW = 1;
/** 太史慈【死战】：发动后摸牌数 */
export const SIZHAN_DRAW = 1;
/** 公孙瓒【白马】：使用装备牌时摸牌数 */
export const BAIMA_DRAW = 1;

/** 郭嘉【谋算】观看的牌数 */
export const MOUSUAN_VIEW = 4;

/** 平衡测试用的开关（scripts/general-stats.ts 的 SKILL 环境变量） */
export const SKILL_TUNING = {
  /** 谋算观看的牌数 */
  mousuanView: MOUSUAN_VIEW,
  /** 主公体力上限加成（按人数覆盖 LORD_BONUS，如 {"6":2}） */
  lordBonus: {} as Record<string, number>,
  /** 武将体力覆盖，如 {"yuji":3} */
  hp: {} as Record<string, number>,
};

/** 对目标有害的锦囊 */
export const HARMFUL_TRICK_KEYS = new Set(['jieying', 'cefan', 'xiwen', 'biwu', 'duanliang', 'junling', 'tianlei']);

/** 内部用于中断流程的胜负信号 */
/** 座位距离（只用公开信息：存活、坐骑；不含【先登】等技能），引擎与 AI 共用 */
export function seatDistance(
  players: ReadonlyArray<{ seat: number; alive: boolean; equips: Partial<Record<string, unknown>> }>,
  from: number,
  to: number,
): number {
  if (from === to) return 0;
  const alive = players.filter((p) => p.alive).map((p) => p.seat);
  const i = alive.indexOf(from);
  const j = alive.indexOf(to);
  if (i < 0 || j < 0) return Infinity;
  const raw = Math.abs(i - j);
  let d = Math.min(raw, alive.length - raw);
  if (players[to].equips.horsePlus) d += 1;
  if (players[from].equips.horseMinus) d -= 1;
  return Math.max(1, d);
}

export class GameOver extends Error {
  constructor(public readonly winner: Winner) {
    super('game over');
  }
}

export interface GameOptions {
  controllers: Controller[];
  seed?: number;
  names?: string[];
  /** 指定身份（按座位），不指定则随机 */
  roles?: Role[];
  /** 指定武将（按座位），不指定则由各玩家选将 */
  generals?: string[];
  /** 超过该回合数抛出异常，用于测试防止死循环 */
  maxTurns?: number;
  /** 关闭全部武将技能（用于测试基础规则） */
  disableSkills?: boolean;
}

export class Game {
  readonly rng: Rng;
  readonly controllers: Controller[];
  players: Player[] = [];
  drawPile: Card[] = [];
  discardPile: Card[] = [];
  log: LogEntry[] = [];
  current = 0;
  phase: Phase = 'setup';
  turn = 0;
  zhanUsed = 0;
  zhanLimit = 1;
  winner: Winner | null = null;
  /** 鱼鳞甲：各角色上次触发的回合 */
  private yulinTurn = new Map<number, number>();
  /** 公开的敌对行为记录（见 GameView.hostility） */
  hostility: number[][] = [];
  /** 公开的帮助行为记录（见 GameView.help） */
  help: number[][] = [];
  /** 阵亡顺序 */
  deathOrder: number[] = [];
  /** 本回合已发动的限一次技能 */
  skillUsed = new Set<string>();
  /** 张辽【先登】本回合是否生效 */
  xiandeng = false;
  /** 本回合【神算】是否已因使用锦囊摸过牌 */
  shensuanDrawn = false;
  /** 本回合当前角色是否对其他角色造成过伤害（司马懿【韬晦】） */
  dealtDamageThisTurn = false;
  /** 张角【聚众】已增加的体力上限 */
  juzhongGained = new Map<number, number>();
  /** 典韦【舍身】上次发动的回合 */
  sheshenTurn = -1;
  /** 已发动过【焚城】（限定技）的角色 */
  fenchengUsed = new Set<number>();
  /** 本回合当前角色的【断粮】判定生效（摸牌阶段少摸 1 张） */
  duanliangActive = false;
  /** 本回合当前角色的【军令】判定生效（不能使用【斩】） */
  junlingActive = false;
  /** 正在判定、尚未结算的判定牌（计入牌数守恒） */
  pendingJudge: Card | null = null;
  /** 于吉【卜筮】本轮已发动（于吉自己的回合开始时重置） */
  bushiRoundUsed = false;
  /** 已发动过【隐忍】的座位 */
  yinrenUsed = new Set<number>();
  /** 【隐忍】免伤中的座位（到其下个回合开始） */
  shielded = new Set<number>();
  /** 已主动亮出身份的座位 */
  revealed = new Set<number>();
  /** 每名角色本局受到过的伤害 */
  damageTaken: number[] = [];
  /** 本回合不能使用或打出牌的座位（【隐忍】） */
  locked = new Set<number>();
  /** 【隐忍】摸牌后剩余的强化次数（之后使用或打出的牌，伤害 / 回复 +1） */
  empower: number[] = [];
  /** 正在结算的强化牌的使用者（可嵌套） */
  private boostStack: number[] = [];
  /** 最近一次 askForCard 打出的牌是否消耗了强化 */
  private lastBoost = false;
  private listeners: Array<() => void> = [];

  constructor(private readonly opts: GameOptions) {
    if (!ROLE_TABLE[opts.controllers.length]) {
      throw new Error(`需要 ${PLAYER_COUNTS.join(' / ')} 个控制器`);
    }
    this.rng = new Rng(opts.seed ?? Date.now());
    this.controllers = opts.controllers;
  }

  // ───────────── 事件与日志 ─────────────

  subscribe(fn: () => void): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  private emit(): void {
    for (const l of this.listeners) l();
  }

  /** 下一条出牌 / 弃牌事件是否为一次新结算的开始 */
  private resolutionStart = false;

  /** 标记新结算开始（出牌阶段的一次使用、弃牌阶段弃牌等） */
  private beginResolution(): void {
    this.resolutionStart = true;
  }

  addLog(text: string, event?: LogEvent): void {
    if (event && (event.type === 'use' || event.type === 'discard') && this.resolutionStart) {
      this.resolutionStart = false;
      event = { ...event, start: true };
    }
    this.log.push(event ? { turn: this.turn, text, event } : { turn: this.turn, text });
    this.emit();
  }

  who(seat: number): string {
    const p = this.players[seat];
    return p.general ? `${p.name}（${generalDef(p.general).name}）` : p.name;
  }

  /** 角色是否拥有某武将的技能（存活） */
  is(seat: number, general: string): boolean {
    const p = this.players[seat];
    return !this.opts.disableSkills && p.alive && p.general === general;
  }

  /** 主公技：须为主公且为该武将 */
  isLord(seat: number, general: string): boolean {
    return this.is(seat, general) && this.players[seat].role === 'lord';
  }

  faction(seat: number) {
    return generalDef(this.players[seat].general).faction;
  }

  /** 记录公开的敌对行为；weight 为该行为的分量（见 HOSTILE_WEIGHT） */
  markHostile(from: number, to: number, weight: number = HOSTILE_WEIGHT.zhan): void {
    if (from !== to && this.hostility[from]) this.hostility[from][to] += weight;
  }

  /** 记录公开的帮助行为（救人、回血、替人挡锦囊等） */
  markHelp(from: number, to: number, weight: number): void {
    if (from !== to && this.help[from]) this.help[from][to] += weight;
  }

  // ───────────── 对局流程 ─────────────

  async start(): Promise<Winner> {
    await this.setup();
    return this.loop();
  }

  async setup(): Promise<void> {
    const n = this.controllers.length;
    const roles = this.opts.roles ?? this.rng.shuffle([...ROLE_TABLE[n]]);
    this.players = roles.map((role, seat) => ({
      seat,
      name: this.opts.names?.[seat] ?? `${seat + 1}号位`,
      general: '',
      role,
      hp: 0,
      maxHp: 0,
      hand: [],
      equips: {},
      judge: [],
      alive: true,
    }));

    this.hostility = roles.map(() => roles.map(() => 0));
    this.help = roles.map(() => roles.map(() => 0));
    const lordSeat = roles.indexOf('lord');
    await this.chooseGenerals(lordSeat);

    for (const p of this.players) {
      p.maxHp = (SKILL_TUNING.hp[p.general] ?? generalDef(p.general).hp) + (p.role === 'lord' ? (SKILL_TUNING.lordBonus[n] ?? LORD_BONUS[n]) : 0);
      p.hp = p.maxHp;
    }

    this.drawPile = this.rng.shuffle(buildDeck());
    this.discardPile = [];
    for (let i = 0; i < n; i++) this.drawCards(this.players[(lordSeat + i) % n], INITIAL_HAND, true);

    this.current = lordSeat;
    this.addLog(`对局开始。主公是 ${this.who(lordSeat)}。`);
  }

  private async chooseGenerals(lordSeat: number): Promise<void> {
    if (this.opts.generals) {
      this.opts.generals.forEach((g, seat) => (this.players[seat].general = g));
      return;
    }
    const pool = this.rng.shuffle([...GENERAL_KEYS]);
    const take = (k: number) => pool.splice(0, k);

    // 主公先选，结果公开；其余玩家再选
    const lordOptions = take(LORD_CHOICES);
    this.players[lordSeat].general = this.validChoice(
      await this.ask(lordSeat, { type: 'chooseGeneral', options: lordOptions }),
      lordOptions,
    );
    for (const p of this.players) {
      if (p.seat === lordSeat) continue;
      const options = take(OTHER_CHOICES);
      p.general = this.validChoice(await this.ask(p.seat, { type: 'chooseGeneral', options }), options);
    }
  }

  private validChoice(choice: string, options: string[]): string {
    return options.includes(choice) ? choice : options[0];
  }

  async loop(): Promise<Winner> {
    const maxTurns = this.opts.maxTurns ?? Infinity;
    try {
      for (;;) {
        if (this.turn >= maxTurns) throw new Error(`超过最大回合数 ${maxTurns}`);
        await this.runTurn(this.current);
        this.current = this.nextAlive(this.current);
      }
    } catch (e) {
      if (e instanceof GameOver) {
        this.winner = e.winner;
        this.phase = 'over';
        this.addLog(`游戏结束，${WINNER_NAME[e.winner]}获胜！`);
        return e.winner;
      }
      throw e;
    }
  }

  async runTurn(seat: number): Promise<void> {
    const p = this.players[seat];
    this.turn++;
    this.zhanUsed = 0;
    this.zhanLimit = this.is(seat, 'zhaoyun') ? 2 : 1; // 七进
    if (this.guoguan(seat)) this.zhanLimit += 1; // 过关
    this.skillUsed.clear();
    this.xiandeng = false;
    this.shensuanDrawn = false;
    this.dealtDamageThisTurn = false;
    this.duanliangActive = false;
    this.junlingActive = false;
    if (this.is(seat, 'yuji')) this.bushiRoundUsed = false;
    const shieldEnds = this.shielded.delete(seat);
    this.locked.clear();
    this.addLog(`—— 第 ${this.turn} 回合：${this.who(seat)} ——`, { type: 'turn', seat });
    if (shieldEnds) this.addLog(`${this.who(seat)} 的【隐忍】免伤效果结束。`);

    this.phase = 'prepare';
    if (this.is(seat, 'huatuo')) await this.yangsheng(p);
    await this.judgePhase(p);
    if (!p.alive) return;
    this.phase = 'draw';
    await this.drawPhase(p);
    if (!p.alive) return;

    this.phase = 'play';
    await this.playPhase(p);
    if (!p.alive) return;

    this.phase = 'discard';
    await this.discardPhase(p);
    if (!p.alive) return;

    this.phase = 'end';
    // 坐断
    if (this.is(seat, 'sunquan') && p.hand.length < p.hp) {
      this.addLog(`${this.who(seat)} 发动【坐断】。`);
      this.drawCards(p, 1);
    }
    // 坚城
    const jiancheng = equipCount(p) - JIANCHENG_FREE;
    if (this.is(seat, 'caoren') && jiancheng > 0) {
      this.addLog(`${this.who(seat)} 发动【坚城】。`);
      this.drawCards(p, jiancheng);
    }
    // 韬晦
    if (this.is(seat, 'simayi') && !this.dealtDamageThisTurn) {
      this.addLog(`${this.who(seat)} 发动【韬晦】。`);
      this.drawCards(p, TAOHUI_DRAW);
    }
  }

  /** 关羽【过关】：存活角色不多于 3 人时生效 */
  guoguan(seat: number): boolean {
    return this.is(seat, 'guanyu') && this.players.filter((p) => p.alive).length <= 3;
  }

  /** 华佗【养生】：准备阶段已受伤时，可弃一张手牌回复 1 点体力，然后摸一张牌（弃【药】时不摸） */
  async yangsheng(p: Player): Promise<void> {
    if (p.hp >= p.maxHp || p.hand.length === 0) return;
    this.beginResolution();
    const options = [
      ...p.hand.map((c) => ({ id: String(c.id), label: `弃置 ${cardText(c)}` })),
      { id: 'no', label: '不发动' },
    ];
    const ans = await this.ask(p.seat, { type: 'choose', reason: 'yangsheng', options });
    const card = ans === 'no' ? null : this.takeFromHand(p, Number(ans));
    if (!card) return;
    this.discard([card]);
    this.addLog(`${this.who(p.seat)} 发动【养生】，弃置了 ${cardText(card)}。`, { type: 'use', from: p.seat, to: [], cards: [card], skill: '养生' });
    this.recover(p.seat, 1);
    if (card.key !== 'yao') this.drawCards(p, 1); // 弃【药】时不摸牌
  }

  /**
   * 判定：按放入顺序结算判定区的延时锦囊。每张判定前从当前角色开始询问【识破】，
   * 被抵消则直接弃置；否则翻开牌堆顶一张作为判定牌。
   */
  async judgePhase(p: Player): Promise<void> {
    // i：下一张要判定的牌；没地方可传的【天雷】留在原处，跳过它
    let i = 0;
    while (i < p.judge.length && p.alive) {
      // 结算完毕前牌仍留在判定区（保证任何时刻牌数守恒）；渡江的牌按【断粮】结算
      const { card: real, from, as } = p.judge[i];
      const card = as ? { ...real, key: as } : real;
      const lei = card.key === 'tianlei';
      const done = () => this.discard(p.judge.splice(i, 1).map((j) => j.card));
      // 天雷没劈中（或被识破）：移至下家；无处可传时留下
      const pass = () => {
        if (!this.passTianlei(p, i)) i++;
      };
      this.beginResolution();
      this.addLog(`${this.who(p.seat)} 的 ${cardText(card)} 开始判定。`, { type: 'use', from: p.seat, to: [], cards: [card], skill: '判定' });
      if (await this.nullified(card, from, p.seat)) {
        if (lei) pass();
        else done();
        continue;
      }
      const result = await this.judge(p.seat, card.key);
      if (!result) {
        if (lei) pass();
        else done();
        continue;
      }
      const effective = lei ? tianleiHit(result) : card.key === 'duanliang' ? result.suit !== 'club' : !isRed(result);
      if (!lei || effective) done();
      if (effective && card.key === 'duanliang') this.duanliangActive = true;
      if (effective && card.key === 'junling') this.junlingActive = true;
      const effect = lei ? `受到 ${TIANLEI_DAMAGE} 点伤害` : card.key === 'duanliang' ? '本回合摸牌阶段少摸 1 张牌' : '本回合不能使用【斩】';
      this.addLog(
        `${this.who(p.seat)} 的【${cardDef(card.key).name}】判定结果为 ${cardText(result)}，${effective ? `生效：${effect}` : '未生效'}。`,
        { type: 'judge', seat: p.seat, what: card.key, trick: card, result, effective },
      );
      if (lei && !effective) pass();
      await this.finishJudge(p.seat, result);
      if (lei && effective) await this.damage(null, p.seat, TIANLEI_DAMAGE);
    }
  }

  /** 把 p 判定区第 i 张（【天雷】）移至下一名判定区没有【天雷】的存活角色；返回是否移走 */
  private passTianlei(p: Player, i: number): boolean {
    const next = this.aliveFrom(p.seat)
      .slice(1)
      .find((s) => !this.players[s].judge.some((j) => j.card.key === 'tianlei'));
    if (next === undefined) return false;
    const [j] = p.judge.splice(i, 1);
    this.players[next].judge.push({ card: j.card, from: j.from });
    this.addLog(`【天雷】移至 ${this.who(next)} 的判定区。`);
    return true;
  }

  /** 兽面盾：成为劫营 / 策反的目标时判定，红色则此牌无效；返回是否挡住 */
  private async shieldBlocks(target: number): Promise<boolean> {
    if (this.players[target].equips.armor?.key !== 'shoumiandun') return false;
    const result = await this.judge(target, 'shoumiandun');
    if (!result) return false;
    const ok = isRed(result);
    this.addLog(`${this.who(target)} 的【兽面盾】判定结果为 ${cardText(result)}，${ok ? '生效：此牌对其无效' : '未生效'}。`, {
      type: 'judge',
      seat: target,
      what: 'shoumiandun',
      result,
      effective: ok,
    });
    await this.finishJudge(target, result);
    return ok;
  }

  /**
   * 进行判定：翻开牌堆顶一张作为判定牌，然后询问荀彧【定策】是否改判。
   * 返回最终判定牌（仍未结算，结算后须调用 finishJudge）。
   */
  async judge(seat: number, what: string): Promise<Card | null> {
    let result = this.takeTop(1)[0];
    if (!result) return null;
    this.pendingJudge = result;
    // 定策：打出一张手牌代替判定牌，然后摸一张
    for (const s of this.aliveFrom(this.current)) {
      const x = this.players[s];
      if (!this.is(s, 'xunyu') || x.hand.length === 0 || this.locked.has(s)) continue;
      const judge: JudgeInfo = { seat, what, result };
      const ans = await this.ask(s, {
        type: 'choose',
        reason: 'dingce',
        judge,
        options: [...x.hand.map((c) => ({ id: String(c.id), label: `打出 ${cardText(c)} 代替` })), { id: 'no', label: '不发动' }],
      });
      const card = ans === 'no' ? null : this.takeFromHand(x, Number(ans));
      if (!card) continue;
      this.consumeBoost(s);
      // 先换掉「正在判定的牌」再弃置原判定牌，避免同一张牌短暂同时出现在两处
      this.pendingJudge = card;
      this.discard([result]);
      this.addLog(`${this.who(s)} 发动【定策】，打出 ${cardText(card)} 代替了判定牌 ${cardText(result)}。`, {
        type: 'use',
        from: s,
        to: s === seat ? [] : [seat],
        cards: [card],
        skill: '定策',
      });
      result = card;
      this.drawCards(x, 1);
    }
    return result;
  }

  /** 判定牌生效后：于吉【卜筮】可以获得它（其他角色的判定，每轮限一次），否则进入弃牌堆 */
  async finishJudge(seat: number, result: Card): Promise<void> {
    this.pendingJudge = null;
    for (const s of this.aliveFrom(this.current)) {
      if (s === seat || !this.is(s, 'yuji') || this.bushiRoundUsed) continue;
      const ans = await this.ask(s, {
        type: 'choose',
        reason: 'bushi',
        judge: { seat, what: '', result },
        options: [
          { id: 'yes', label: `获得判定牌 ${cardText(result)}` },
          { id: 'no', label: '不发动' },
        ],
      });
      if (ans !== 'yes') continue;
      this.bushiRoundUsed = true;
      this.players[s].hand.push(result);
      this.addLog(`${this.who(s)} 发动【卜筮】，获得了判定牌 ${cardText(result)}。`);
      return;
    }
    this.discard([result]);
  }

  async drawPhase(p: Player): Promise<void> {
    const seat = p.seat;
    // 断粮：本回合少摸 1 张
    const less = this.duanliangActive ? 1 : 0;
    if (this.is(seat, 'zhugeliang')) {
      // 神算：观看 3 张，获得 2 张（断粮时 1 张），余下置于牌堆底
      const keep = 2 - less;
      const top = this.takeTop(3);
      if (top.length <= keep) {
        p.hand.push(...top);
      } else {
        const chosen = this.validSelection(
          await this.ask(seat, { type: 'selectCards', cards: top, count: keep, reason: 'shensuan' }),
          top,
          keep,
        );
        for (const c of top) (chosen.includes(c) ? p.hand : this.drawPile).unshift(c);
        // 手牌顺序无关；落选的牌已放到牌堆底（数组开头）
      }
      this.addLog(`${this.who(seat)} 发动【神算】，观看牌堆顶 3 张牌并获得 ${keep} 张。`);
      return;
    }
    if (this.is(seat, 'zhangliao')) {
      const choice = await this.ask(seat, {
        type: 'choose',
        reason: 'xiandeng',
        options: [
          { id: 'yes', label: '发动【先登】：少摸 1 张，本回合与其他角色距离视为 1、可多用 1 张【斩】' },
          { id: 'no', label: '正常摸牌' },
        ],
      });
      if (choice === 'yes') {
        this.xiandeng = true;
        this.zhanLimit += 1;
        this.addLog(`${this.who(seat)} 发动【先登】。`);
        this.drawCards(p, DRAW_PER_TURN - 1 - less);
        return;
      }
    }
    const extra = this.guoguan(seat) ? 1 : 0; // 过关
    if (extra) this.addLog(`${this.who(seat)} 的【过关】生效。`);
    this.drawCards(p, DRAW_PER_TURN + extra - less);
  }

  /** 校验 selectCards 回答，不合法时取前 count 张 */
  private validSelection(ids: number[], cards: Card[], count: number): Card[] {
    const uniq = [...new Set(ids)];
    const picked = uniq.map((id) => cards.find((c) => c.id === id)).filter((c): c is Card => !!c);
    return picked.length === count ? picked : cards.slice(0, count);
  }

  // ───────────── 牌堆操作 ─────────────

  /** 牌堆不足 n 张时，把弃牌堆洗匀后垫在牌堆底 */
  ensureDrawPile(n: number): void {
    if (this.drawPile.length >= n || this.discardPile.length === 0) return;
    this.drawPile = [...this.rng.shuffle(this.discardPile), ...this.drawPile];
    this.discardPile = [];
    this.addLog('弃牌堆洗入牌堆。');
  }

  /** 取出牌堆顶 n 张（第一张为最上面） */
  takeTop(n: number): Card[] {
    this.ensureDrawPile(n);
    return this.drawPile.splice(-Math.min(n, this.drawPile.length)).reverse();
  }

  /** 按给定顺序放回牌堆顶（第一张在最上面） */
  putOnTop(cards: Card[]): void {
    for (let i = cards.length - 1; i >= 0; i--) this.drawPile.push(cards[i]);
  }

  drawCards(p: Player, n: number, silent = false): Card[] {
    const drawn = this.takeTop(n);
    p.hand.push(...drawn);
    if (!silent && drawn.length > 0) this.addLog(`${this.who(p.seat)} 摸了 ${drawn.length} 张牌。`);
    return drawn;
  }

  /** 从手牌移除指定牌并返回，不存在则返回 null */
  takeFromHand(p: Player, cardId: number): Card | null {
    const i = p.hand.findIndex((c) => c.id === cardId);
    return i < 0 ? null : p.hand.splice(i, 1)[0];
  }

  discard(cards: Card[]): void {
    this.discardPile.push(...cards);
  }

  // ───────────── 距离 ─────────────

  distance(from: number, to: number): number {
    if (from === to) return 0;
    if (this.xiandeng && from === this.current && this.is(from, 'zhangliao')) return 1; // 先登
    return seatDistance(this.players, from, to);
  }

  attackRange(seat: number): number {
    const weapon = this.players[seat].equips.weapon;
    const base = weapon ? cardDef(weapon.key).range ?? 1 : 1;
    const p = this.players[seat];
    const baima = this.is(seat, 'gongsunzan') && !!(p.equips.horseMinus || p.equips.horsePlus);
    return base + (this.is(seat, 'lvbu') ? 1 : 0) + (baima ? 1 : 0); // 骁勇、白马
  }

  inAttackRange(from: number, to: number): boolean {
    return from !== to && this.distance(from, to) <= this.attackRange(from);
  }

  nextAlive(seat: number): number {
    const n = this.players.length;
    for (let i = 1; i <= n; i++) {
      const s = (seat + i) % n;
      if (this.players[s].alive) return s;
    }
    return seat;
  }

  prevAlive(seat: number): number {
    const n = this.players.length;
    for (let i = 1; i <= n; i++) {
      const s = (seat - i + n) % n;
      if (this.players[s].alive) return s;
    }
    return seat;
  }

  /** 从 start 开始按座位顺序排列的存活角色 */
  aliveFrom(start: number): number[] {
    const n = this.players.length;
    const res: number[] = [];
    for (let i = 0; i < n; i++) {
      const s = (start + i) % n;
      if (this.players[s].alive) res.push(s);
    }
    return res;
  }

  // ───────────── 出牌阶段 ─────────────

  private hasCards(p: Player): boolean {
    return p.hand.length > 0 || Object.values(p.equips).some(Boolean);
  }

  private weaponKey(seat: number): string | undefined {
    return this.players[seat].equips.weapon?.key;
  }

  /** 可以成为该角色【斩】目标的角色 */
  zhanTargets(seat: number): number[] {
    const shenbi = this.weaponKey(seat) === 'shenbigong';
    const anyRange = this.is(seat, 'huangzhong'); // 宝刀：【斩】无视距离
    return this.players
      .filter((t) => t.alive && t.seat !== seat && (anyRange || this.inAttackRange(seat, t.seat)))
      .filter((t) => !(shenbi && this.distance(seat, t.seat) === 1))
      .map((t) => t.seat);
  }

  /** 镔铁大戟：与主目标相邻（存活座位意义上）的其他角色 */
  adjacentExtraTargets(user: number, target: number): number[] {
    const res = new Set([this.nextAlive(target), this.prevAlive(target)]);
    res.delete(user);
    res.delete(target);
    return [...res];
  }

  legalPlays(seat: number): PlayOption[] {
    const p = this.players[seat];
    const others = this.players.filter((t) => t.alive && t.seat !== seat);
    const options: PlayOption[] = [];
    for (const card of p.hand) {
      const def = cardDef(card.key);
      if (def.kind === 'equip') {
        options.push({ cardId: card.id, targets: [] });
        continue;
      }
      switch (card.key) {
        case 'zhan': {
          if (this.zhanUsed >= this.zhanLimit || this.zhanBlocked(seat)) break;
          const targets = this.zhanTargets(seat);
          if (targets.length === 0) break;
          const opt: PlayOption = { cardId: card.id, targets };
          if (this.weaponKey(seat) === 'bintieji') {
            opt.extraTargets = Object.fromEntries(targets.map((t) => [t, this.adjacentExtraTargets(seat, t)]));
          }
          options.push(opt);
          break;
        }
        case 'yao':
          if (p.hp < p.maxHp) options.push({ cardId: card.id, targets: [] });
          break;
        case 'tiaobing':
        case 'xiwen':
        case 'xiuzheng':
          options.push({ cardId: card.id, targets: [] });
          break;
        case 'jieying': {
          const targets = others.filter((t) => this.hasCards(t)).map((t) => t.seat);
          if (targets.length > 0) options.push({ cardId: card.id, targets });
          break;
        }
        case 'cefan': {
          const targets = others
            .filter((t) => this.hasCards(t) && this.distance(seat, t.seat) <= 1)
            .map((t) => t.seat);
          if (targets.length > 0) options.push({ cardId: card.id, targets });
          break;
        }
        case 'biwu':
          if (others.length > 0) options.push({ cardId: card.id, targets: others.map((t) => t.seat) });
          break;
        case 'tianlei':
          // 对自己使用；判定区已有【天雷】时不能再用
          if (!p.judge.some((j) => j.card.key === 'tianlei')) options.push({ cardId: card.id, targets: [] });
          break;
        case 'duanliang':
        case 'junling': {
          // 同名延时锦囊不能重复放入；断粮限距离 1
          const targets = others
            .filter((t) => !t.judge.some((j) => (j.as ?? j.card.key) === card.key))
            .filter((t) => card.key !== 'duanliang' || this.distance(seat, t.seat) <= 1)
            .map((t) => t.seat);
          if (targets.length > 0) options.push({ cardId: card.id, targets });
          break;
        }
      }
    }
    return options;
  }

  /** 军令：判定生效的回合内不能使用【斩】（打出不受影响） */
  zhanBlocked(seat: number): boolean {
    return this.junlingActive && seat === this.current;
  }

  legalSkills(seat: number): SkillOption[] {
    const p = this.players[seat];
    const res: SkillOption[] = [];
    const others = this.players.filter((t) => t.alive && t.seat !== seat).map((t) => t.seat);
    if (this.is(seat, 'liubei') && !this.skillUsed.has('kuanren') && p.hand.length >= 1) {
      const targets = this.players.filter((t) => t.alive && t.seat !== seat && t.hp < t.maxHp).map((t) => t.seat);
      if (targets.length > 0) res.push({ skill: 'kuanren', cardCount: 1, targets });
    }
    if (this.is(seat, 'zhouyu') && !this.skillUsed.has('huoji') && hasSameSuitPair(p.hand) && others.length > 0) {
      res.push({ skill: 'huoji', cardCount: 2, targets: others });
    }
    if (this.is(seat, 'diaochan') && !this.skillUsed.has('huoxin')) {
      const second: Record<number, number[]> = {};
      for (const a of others) {
        const bs = others.filter((b) => b !== a && this.inAttackRange(a, b));
        if (bs.length > 0) second[a] = bs;
      }
      const targets = Object.keys(second).map(Number);
      if (targets.length > 0) res.push({ skill: 'huoxin', cardCount: 0, targets, secondTargets: second });
    }
    // 宝刀：装备牌当【斩】，无视距离，计入次数
    if (this.is(seat, 'huangzhong') && this.zhanUsed < this.zhanLimit && !this.zhanBlocked(seat) && p.hand.some(isEquip) && others.length > 0) {
      res.push({ skill: 'baodao', cardCount: 1, targets: others });
    }
    if (this.is(seat, 'lusu') && !this.skillUsed.has('lianmeng') && p.hand.length >= 1 && others.length > 0) {
      res.push({ skill: 'lianmeng', cardCount: 1, targets: others });
    }
    if (this.is(seat, 'weiyan') && !this.skillUsed.has('qixi')) {
      res.push({ skill: 'qixi', cardCount: 0, targets: [] });
    }
    // 渡江：♦ 手牌当【断粮】，不受距离限制
    if (this.is(seat, 'lvmeng') && !this.skillUsed.has('dujiang') && p.hand.some((c) => c.suit === 'diamond')) {
      const targets = others.filter((t) => !this.players[t].judge.some((j) => (j.as ?? j.card.key) === 'duanliang'));
      if (targets.length > 0) res.push({ skill: 'dujiang', cardCount: 1, targets });
    }
    if (this.is(seat, 'zhangfei') && !this.skillUsed.has('duoxie')) {
      const targets = others.filter((t) => this.distance(seat, t) <= 1 && equipCount(this.players[t]) > 0);
      if (targets.length > 0) res.push({ skill: 'duoxie', cardCount: 0, targets });
    }
    if (this.hasYinren(seat) && !this.yinrenUsed.has(seat)) {
      if ((this.damageTaken[seat] ?? 0) > 0) res.push({ skill: 'yinrenDraw', cardCount: 0, targets: [] });
      if (others.length > 0) res.push({ skill: 'yinrenHit', cardCount: 0, targets: others });
    }
    if (this.is(seat, 'dongzhuo') && !this.fenchengUsed.has(seat) && others.length > 0) {
      res.push({ skill: 'fencheng', cardCount: 0, targets: [] });
    }
    return res;
  }

  async playPhase(p: Player): Promise<void> {
    // 上限防止控制器反复提交非法操作导致死循环
    for (let guard = 0; guard < 200; guard++) {
      if (!p.alive) return;
      const options = this.legalPlays(p.seat);
      const skills = this.legalSkills(p.seat);
      if (options.length === 0 && skills.length === 0) return;
      const action: PlayAction = await this.ask(p.seat, { type: 'play', options, skills });
      if (action.type === 'end') return;
      if (action.type === 'skill') {
        const opt = skills.find((o) => o.skill === action.skill);
        if (opt) {
          this.beginResolution();
          await this.useSkill(p, opt, action.cards, action.targets);
        }
        continue;
      }
      const opt = options.find((o) => o.cardId === action.cardId);
      if (!opt) continue;
      if (opt.targets.length > 0 && (action.target === undefined || !opt.targets.includes(action.target))) continue;
      let extra: number | undefined;
      if (action.extraTarget !== undefined && action.target !== undefined) {
        if (!opt.extraTargets?.[action.target]?.includes(action.extraTarget)) continue;
        extra = action.extraTarget;
      }
      const card = this.takeFromHand(p, action.cardId)!;
      this.beginResolution();
      await this.withBoost(p.seat, this.consumeBoost(p.seat), () => this.useCard(p, card, action.target, extra));
    }
  }

  async useCard(p: Player, card: Card, target?: number, extraTarget?: number): Promise<void> {
    const def = cardDef(card.key);
    if (def.kind === 'equip') {
      const slot = def.slot!;
      const old = p.equips[slot];
      if (old) this.discard([old]);
      p.equips[slot] = card;
      this.addLog(`${this.who(p.seat)} 装备了 ${cardText(card)}。`, { type: 'use', from: p.seat, to: [], cards: [card] });
      if (this.is(p.seat, 'gongsunzan')) {
        this.addLog(`${this.who(p.seat)} 发动【白马】。`);
        this.drawCards(p, BAIMA_DRAW);
      }
      return;
    }

    const user = p.seat;
    if (def.delayed) {
      // 延时锦囊：置于目标判定区，使用时不能被【识破】（判定前才询问）
      if (card.key === 'tianlei') {
        p.judge.push({ card, from: user });
        this.addLog(`${this.who(user)} 使用了 ${cardText(card)}，置于自己的判定区。`, { type: 'use', from: user, to: [], cards: [card] });
        this.shensuanDraw(p);
        return;
      }
      const t = target!;
      this.players[t].judge.push({ card, from: user });
      this.markHostile(user, t, HOSTILE_WEIGHT.delay);
      this.addLog(`${this.who(user)} 对 ${this.who(t)} 使用了 ${cardText(card)}，置于其判定区。`, { type: 'use', from: user, to: [t], cards: [card] });
      this.shensuanDraw(p);
      return;
    }
    this.discard([card]);
    if (def.kind === 'trick') this.shensuanDraw(p);
    switch (card.key) {
      case 'zhan': {
        this.zhanUsed++;
        const targets = extraTarget === undefined ? [target!] : [target!, extraTarget];
        this.addLog(`${this.who(user)} 对 ${targets.map((t) => this.who(t)).join('、')} 使用了 ${cardText(card)}。`, { type: 'use', from: user, to: targets, cards: [card] });
        for (const t of targets) this.markHostile(user, t);
        for (const t of targets) await this.resolveZhan(user, t);
        break;
      }
      case 'yao':
        this.addLog(`${this.who(user)} 使用了 ${cardText(card)}。`, { type: 'use', from: user, to: [], cards: [card] });
        this.recover(user, this.boostedBy(user) ? 2 : 1);
        break;
      case 'tiaobing':
        this.addLog(`${this.who(user)} 使用了 ${cardText(card)}。`, { type: 'use', from: user, to: [], cards: [card] });
        if (!(await this.nullified(card, user, user))) this.drawCards(p, 2);
        break;
      case 'jieying':
      case 'cefan': {
        const t = target!;
        this.markHostile(user, t, HOSTILE_WEIGHT.steal);
        this.addLog(`${this.who(user)} 对 ${this.who(t)} 使用了 ${cardText(card)}。`, { type: 'use', from: user, to: [t], cards: [card] });
        if (await this.shieldBlocks(t)) break;
        if (await this.nullified(card, user, t)) break;
        const taken = await this.pickCardFrom(user, t, card.key);
        if (!taken) break;
        if (card.key === 'jieying') {
          this.discard([taken]);
          this.addLog(`${this.who(user)} 弃置了 ${this.who(t)} 的 ${cardText(taken)}。`, { type: 'discard', from: t, cards: [taken] });
        } else {
          p.hand.push(taken);
          this.addLog(`${this.who(user)} 获得了 ${this.who(t)} 的一张牌。`);
        }
        break;
      }
      case 'xiwen':
        this.addLog(`${this.who(user)} 使用了 ${cardText(card)}。`, { type: 'use', from: user, to: [], cards: [card] });
        for (const t of this.aliveFrom(user).slice(1)) {
          if (!this.players[t].alive || (await this.nullified(card, user, t))) continue;
          const paid = await this.askForCard(t, BASIC_KEYS, { kind: 'xiwen', source: user });
          if (paid) this.addLog(`${this.who(t)} 弃置了 ${cardText(paid[0])} 响应【檄文】。`, { type: 'use', from: t, to: [], cards: paid });
          else await this.damage(user, t, 1);
        }
        break;
      case 'biwu': {
        const t = target!;
        this.markHostile(user, t);
        this.addLog(`${this.who(user)} 对 ${this.who(t)} 使用了 ${cardText(card)}。`, { type: 'use', from: user, to: [t], cards: [card] });
        if (await this.nullified(card, user, t)) break;
        let [turn, other] = [t, user];
        for (;;) {
          const z = await this.askForCard(turn, ['zhan'], { kind: 'biwu', opponent: other });
          if (!z) {
            await this.damage(other, turn, 1);
            break;
          }
          this.addLog(`${this.who(turn)} 弃置了 ${cardText(z[0])}。`, { type: 'use', from: turn, to: [other], cards: z });
          [turn, other] = [other, turn];
        }
        break;
      }
      case 'xiuzheng':
        this.addLog(`${this.who(user)} 使用了 ${cardText(card)}。`, { type: 'use', from: user, to: [], cards: [card] });
        for (const t of this.aliveFrom(user)) {
          if (await this.nullified(card, user, t)) continue;
          const tp = this.players[t];
          let choice = 'draw';
          if (tp.hp < tp.maxHp) {
            choice = await this.ask(t, {
              type: 'choose',
              reason: 'xiuzheng',
              options: [
                { id: 'recover', label: '回复 1 点体力' },
                { id: 'draw', label: '摸一张牌' },
              ],
            });
          }
          if (choice === 'recover') this.recover(t, 1);
          else this.drawCards(tp, 1);
        }
        break;
      default:
        throw new Error(`不能主动使用的卡牌: ${card.key}`);
    }
  }

  /** 神算：每回合第一次使用锦囊时摸一张牌 */
  private shensuanDraw(p: Player): void {
    if (!this.is(p.seat, 'zhugeliang') || this.shensuanDrawn) return;
    this.shensuanDrawn = true;
    this.addLog(`${this.who(p.seat)} 的【神算】生效，摸一张牌。`);
    this.drawCards(p, 1);
  }

  /** 发动主动技能；参数不合法时什么也不做 */
  async useSkill(p: Player, opt: SkillOption, cardIds: number[], targets: number[]): Promise<void> {
    const ids = [...new Set(cardIds)];
    const cards = ids.map((id) => p.hand.find((c) => c.id === id));
    if (ids.length !== opt.cardCount || cards.some((c) => !c)) return;
    const seat = p.seat;
    if (opt.skill === 'fencheng') return this.fencheng(p);
    if (opt.skill === 'qixi') return this.qixi(p);
    if (opt.skill === 'yinrenDraw') {
      this.yinrenUsed.add(seat);
      this.revealed.add(seat);
      const n = Math.min(YINREN_DRAW_MAX, this.damageTaken[seat] ?? 0);
      this.addLog(`${this.who(seat)} 发动【隐忍】，亮出身份：【内奸】！摸 ${n} 张牌。`, { type: 'use', from: seat, to: [], cards: [], skill: '隐忍' });
      this.drawCards(p, n);
      this.empower[seat] = n;
      if (n > 0) this.addLog(`${this.who(seat)} 之后使用或打出的 ${n} 张牌，伤害 / 回复值 +1。`);
      return;
    }
    const target = targets[0];
    if (!opt.targets.includes(target)) return;

    switch (opt.skill) {
      case 'yinrenHit': {
        this.yinrenUsed.add(seat);
        this.revealed.add(seat);
        this.markHostile(seat, target);
        this.addLog(`${this.who(seat)} 发动【隐忍】，亮出身份：【内奸】！对 ${this.who(target)} 造成 ${YINREN_DAMAGE} 点伤害。`, { type: 'use', from: seat, to: [target], cards: [], skill: '隐忍' });
        // 受到伤害时即被封牌（濒死时也不能自救）
        this.locked.add(target);
        if ((await this.damage(seat, target, YINREN_DAMAGE)) === 0) this.locked.delete(target);
        else this.addLog(`${this.who(target)} 本回合不能使用或打出牌。`);
        break;
      }
      case 'dujiang': {
        const card = cards[0]!;
        if (card.suit !== 'diamond') return;
        this.skillUsed.add('dujiang');
        this.takeFromHand(p, card.id);
        this.players[target].judge.push({ card, from: seat, as: 'duanliang' });
        this.consumeBoost(seat);
        this.markHostile(seat, target, HOSTILE_WEIGHT.delay);
        this.addLog(`${this.who(seat)} 发动【渡江】，将 ${cardText(card)} 当【断粮】对 ${this.who(target)} 使用。`, {
          type: 'use',
          from: seat,
          to: [target],
          cards: [card],
          skill: '渡江',
        });
        this.drawCards(p, 1);
        break;
      }
      case 'kuanren': {
        this.skillUsed.add('kuanren');
        for (const id of ids) this.takeFromHand(p, id);
        this.discard(cards as Card[]);
        this.addLog(`${this.who(seat)} 发动【宽仁】，弃置 ${cardText(cards[0]!)}，令 ${this.who(target)} 回复体力。`, { type: 'use', from: seat, to: [target], cards: cards as Card[], skill: '宽仁' });
        this.markHelp(seat, target, HELP_WEIGHT.heal);
        this.recover(target, 1);
        break;
      }
      case 'huoji': {
        const [a, b] = cards as Card[];
        if (a.suit !== b.suit) return;
        this.skillUsed.add('huoji');
        this.markHostile(seat, target);
        for (const id of ids) this.takeFromHand(p, id);
        this.discard([a, b]);
        this.addLog(`${this.who(seat)} 发动【火计】，弃置 ${cardText(a)}、${cardText(b)}，对 ${this.who(target)} 造成伤害。`, { type: 'use', from: seat, to: [target], cards: [a, b], skill: '火计' });
        await this.damage(seat, target, 1);
        // 弃置的是红色牌（同花色，两张同色）时摸一张牌
        if (isRed(a) && p.alive) this.drawCards(p, 1);
        break;
      }
      case 'huoxin': {
        const victim = targets[1];
        if (!opt.secondTargets?.[target]?.includes(victim)) return;
        this.skillUsed.add('huoxin');
        this.markHostile(seat, victim);
        this.addLog(`${this.who(seat)} 发动【惑心】，令 ${this.who(target)} 对 ${this.who(victim)} 使用【斩】。`, { type: 'use', from: seat, to: [target], cards: [], skill: '惑心' });
        const z = await this.askForCard(target, ['zhan'], { kind: 'huoxin', victim, from: seat });
        if (z) {
          this.addLog(`${this.who(target)} 对 ${this.who(victim)} 使用了 ${cardText(z[0])}。`, { type: 'use', from: target, to: [victim], cards: z });
          this.markHostile(target, victim, HOSTILE_WEIGHT.forced);
          await this.withBoost(target, this.lastBoost, () => this.resolveZhan(target, victim));
        } else {
          const a = this.players[target];
          if (a.hand.length === 0 || !p.alive) break;
          const [give] = this.validSelection(
            await this.ask(target, { type: 'selectCards', cards: [...a.hand], count: 1, reason: 'huoxin' }),
            a.hand,
            1,
          );
          this.takeFromHand(a, give.id);
          p.hand.push(give);
          this.addLog(`${this.who(target)} 交给 ${this.who(seat)} 一张手牌。`);
        }
        break;
      }
      case 'baodao': {
        const card = cards[0]!;
        if (!isEquip(card)) return;
        this.takeFromHand(p, card.id);
        this.discard([card]);
        this.zhanUsed++;
        this.addLog(`${this.who(seat)} 发动【宝刀】，将 ${cardText(card)} 当作【斩】对 ${this.who(target)} 使用。`, {
          type: 'use',
          from: seat,
          to: [target],
          cards: [card],
          skill: '宝刀',
        });
        this.markHostile(seat, target);
        await this.withBoost(seat, this.consumeBoost(seat), () => this.resolveZhan(seat, target));
        break;
      }
      case 'duoxie': {
        this.skillUsed.add('duoxie');
        const t = this.players[target];
        const equips = Object.values(t.equips).filter((c): c is Card => !!c);
        const [pick] = this.validSelection(await this.ask(seat, { type: 'selectCards', cards: equips, count: 1, reason: 'duoxie' }), equips, 1);
        const slot = (Object.keys(t.equips) as EquipSlot[]).find((k) => t.equips[k] === pick)!;
        delete t.equips[slot];
        p.hand.push(pick);
        this.addLog(`${this.who(seat)} 发动【夺械】，获得了 ${this.who(target)} 的 ${cardText(pick)}，${this.who(target)} 摸一张牌。`, {
          type: 'use',
          from: seat,
          to: [target],
          cards: [],
          skill: '夺械',
        });
        this.markHostile(seat, target, HOSTILE_WEIGHT.steal);
        this.drawCards(t, DUOXIE_DRAW);
        break;
      }
      case 'lianmeng': {
        this.skillUsed.add('lianmeng');
        const card = this.takeFromHand(p, cards[0]!.id)!;
        this.players[target].hand.push(card);
        this.addLog(`${this.who(seat)} 发动【联盟】，交给 ${this.who(target)} 一张手牌，然后摸一张牌。`, {
          type: 'use',
          from: seat,
          to: [target],
          cards: [],
          skill: '联盟',
        });
        this.markHelp(seat, target, HELP_WEIGHT.gift);
        this.drawCards(p, 1);
        break;
      }
    }
  }

  /** 董卓【焚城】：对所有其他角色各造成 1 点伤害，然后失去 1 点体力 */
  /** 魏延【奇袭】：判定，黑色可以视为对距离 1 的一名其他角色使用【斩】（不计入次数） */
  async qixi(p: Player): Promise<void> {
    const seat = p.seat;
    this.skillUsed.add('qixi');
    this.addLog(`${this.who(seat)} 发动【奇袭】，进行判定。`, { type: 'use', from: seat, to: [], cards: [], skill: '奇袭' });
    const result = await this.judge(seat, 'qixi');
    if (!result) return;
    const black = !isRed(result);
    this.addLog(`${this.who(seat)} 的【奇袭】判定结果为 ${cardText(result)}，${black ? '黑色：可以视为使用一张【斩】' : '红色：无效果'}。`, {
      type: 'judge',
      seat,
      what: 'qixi',
      result,
      effective: black,
    });
    await this.finishJudge(seat, result);
    if (!p.alive || !black) return;
    const targets = this.players.filter((t) => t.alive && t.seat !== seat && this.distance(seat, t.seat) <= 1).map((t) => t.seat);
    if (targets.length === 0) return;
    const ans = await this.ask(seat, {
      type: 'choose',
      reason: 'qixi',
      options: [...targets.map((t) => ({ id: String(t), label: `视为对 ${this.who(t)} 使用【斩】` })), { id: 'no', label: '不使用' }],
    });
    const t = Number(ans);
    if (ans === 'no' || !targets.includes(t)) return;
    // 视为使用【斩】（不计入次数）：目标可以打出【避】
    this.markHostile(seat, t);
    this.addLog(`${this.who(seat)} 发动【奇袭】，视为对 ${this.who(t)} 使用了【斩】。`, { type: 'use', from: seat, to: [t], cards: [], skill: '奇袭' });
    await this.withBoost(seat, this.consumeBoost(seat), () => this.resolveZhan(seat, t));
  }

  async fencheng(p: Player): Promise<void> {
    const seat = p.seat;
    this.fenchengUsed.add(seat);
    const targets = this.aliveFrom(seat).slice(1);
    this.addLog(`${this.who(seat)} 发动限定技【焚城】！`, { type: 'use', from: seat, to: targets, cards: [], skill: '焚城' });
    for (const t of targets) {
      if (this.players[t].alive) await this.damage(seat, t, 1);
    }
    if (p.alive) await this.loseHp(seat, 1);
  }

  /** 失去体力（不是伤害，不触发受到伤害后的技能） */
  async loseHp(seat: number, amount: number): Promise<void> {
    const p = this.players[seat];
    p.hp -= amount;
    this.addLog(`${this.who(seat)} 失去 ${amount} 点体力，体力 ${p.hp}/${p.maxHp}。`, { type: 'damage', seat, amount, from: null });
    if (p.hp <= 0) await this.dying(seat, null);
  }

  async resolveZhan(user: number, target: number): Promise<void> {
    const t = this.players[target];
    if (!t.alive) return;
    const dodged = await this.askDodge(target, user);
    if (dodged) await this.liuxingchui(user, target);
    if (!dodged) {
      const dealt = await this.damage(user, target, 1, 'zhan');
      // 先登：发动的回合，【斩】造成伤害后摸一张牌
      if (dealt > 0 && this.xiandeng && user === this.current && this.is(user, 'zhangliao') && this.players[user].alive) {
        this.addLog(`${this.who(user)} 的【先登】生效，摸一张牌。`);
        this.drawCards(this.players[user], 1);
      }
      // 骁勇：弃置目标一张装备
      const equips = Object.values(t.equips).filter((c): c is Card => !!c);
      if (dealt > 0 && this.is(user, 'lvbu') && t.alive && equips.length > 0) {
        const [pick] = this.validSelection(
          await this.ask(user, { type: 'selectCards', cards: equips, count: 1, reason: 'xiaoyong' }),
          equips,
          1,
        );
        const slot = (Object.keys(t.equips) as Array<keyof Player['equips']>).find((k) => t.equips[k] === pick)!;
        delete t.equips[slot];
        this.discard([pick]);
        this.addLog(`${this.who(user)} 发动【骁勇】，弃置了 ${this.who(target)} 的 ${cardText(pick)}。`, { type: 'discard', from: target, cards: [pick] });
      }
      // 锦帆
      if (dealt > 0 && this.is(user, 'ganning') && t.alive && t.hand.length > 0) {
        const ans = await this.ask(user, {
          type: 'choose',
          reason: 'jinfan',
          options: [
            { id: 'yes', label: `发动【锦帆】：随机获得 ${this.who(target)} 的一张手牌` },
            { id: 'no', label: '不发动' },
          ],
        });
        if (ans === 'yes') {
          const got = t.hand.splice(this.rng.int(t.hand.length), 1)[0];
          this.players[user].hand.push(got);
          this.addLog(`${this.who(user)} 发动【锦帆】，获得了 ${this.who(target)} 的一张手牌。`);
        }
      }
    }
    const u = this.players[user];
    if (u.alive && t.alive && this.weaponKey(user) === 'huanshoudao' && t.hand.length > u.hand.length) {
      this.addLog(`${this.who(user)} 的【环首刀】生效。`);
      this.drawCards(u, 1);
    }
  }

  /** 流星锤：【斩】被抵消后，可以弃置一张手牌令目标弃置一张牌 */
  private async liuxingchui(user: number, target: number): Promise<void> {
    const u = this.players[user];
    const t = this.players[target];
    if (this.weaponKey(user) !== 'liuxingchui' || !u.alive || !t.alive || u.hand.length === 0 || !this.hasCards(t)) return;
    const ans = await this.ask(user, {
      type: 'choose',
      reason: 'liuxing',
      target,
      options: [...u.hand.map((c) => ({ id: String(c.id), label: `弃置 ${cardText(c)}` })), { id: 'no', label: '不发动' }],
    });
    const paid = ans === 'no' ? null : this.takeFromHand(u, Number(ans));
    if (!paid) return;
    this.discard([paid]);
    this.addLog(`${this.who(user)} 发动【流星锤】，弃置了 ${cardText(paid)}。`, { type: 'discard', from: user, cards: [paid] });
    const taken = await this.pickCardFrom(user, target, 'liuxing');
    if (!taken) return;
    this.discard([taken]);
    this.addLog(`${this.who(target)} 因【流星锤】弃置了 ${cardText(taken)}。`, { type: 'discard', from: target, cards: [taken] });
  }

  /** 询问【避】（含铁脊长枪与号令）；返回是否抵消 */
  async askDodge(target: number, source: number): Promise<boolean> {
    const dodge = await this.askForCard(target, ['bi'], { kind: 'dodge', source }, this.weaponKey(target) === 'tiejiqiang');
    if (dodge) {
      const how = dodge.length === 2 || dodge[0].key !== 'bi' ? `将 ${dodge.map(cardText).join('、')} 当作【避】打出` : `打出 ${cardText(dodge[0])}`;
      this.addLog(`${this.who(target)} ${how}，抵消了【斩】。`, { type: 'use', from: target, to: [], cards: dodge });
      // 持重
      if (this.is(target, 'luxun') && target !== this.current) {
        this.addLog(`${this.who(target)} 发动【持重】。`);
        this.drawCards(this.players[target], 1);
      }
      return true;
    }
    if (this.isLord(target, 'caocao')) {
      for (const s of this.aliveFrom(target).slice(1)) {
        if (this.faction(s) !== 'wei') continue;
        const c = await this.askForCard(s, ['bi'], { kind: 'haoling', lord: target, source });
        if (c) {
          this.markHelp(s, target, HELP_WEIGHT.cover);
          this.addLog(`${this.who(s)} 响应【号令】，替 ${this.who(target)} 打出 ${cardText(c[0])}，抵消了【斩】。`, { type: 'use', from: s, to: [target], cards: c });
          return true;
        }
      }
    }
    return false;
  }

  /** 劫营/策反：由使用者选择目标的一张牌（手牌随机），从目标处移除并返回 */
  async pickCardFrom(user: number, target: number, reason: 'jieying' | 'cefan' | 'liuxing'): Promise<Card | null> {
    const t = this.players[target];
    const equips = Object.values(t.equips).filter((c): c is Card => !!c);
    if (t.hand.length === 0 && equips.length === 0) return null;
    const pick: CardPick = await this.ask(user, {
      type: 'chooseCard',
      target,
      handCount: t.hand.length,
      equips,
      reason,
    });
    if (pick.zone === 'equip') {
      const slot = (Object.keys(t.equips) as Array<keyof Player['equips']>).find((k) => t.equips[k]?.id === pick.cardId);
      if (slot) {
        const card = t.equips[slot]!;
        delete t.equips[slot];
        return card;
      }
    }
    if (t.hand.length > 0) return t.hand.splice(this.rng.int(t.hand.length), 1)[0];
    const slot = (Object.keys(t.equips) as Array<keyof Player['equips']>).find((k) => t.equips[k])!;
    const card = t.equips[slot]!;
    delete t.equips[slot];
    return card;
  }

  // ───────────── 响应 ─────────────

  /** 锦囊对某目标生效前，依次询问【识破】；返回 true 表示效果被抵消 */
  async nullified(trick: Card, user: number, target: number): Promise<boolean> {
    if (this.is(user, 'zhugeliang')) return false; // 神算
    let cancelled = false;
    for (;;) {
      let played = false;
      for (const s of this.aliveFrom(this.current)) {
        const c = await this.askForCard(s, ['shipo'], {
          kind: 'shipo',
          trick: trick.key,
          user,
          target,
          countering: cancelled,
        });
        if (!c) continue;
        this.markShipo(s, trick.key, target, !cancelled);
        const what = cancelled ? '【识破】' : `${cardText(trick)} 对 ${this.who(target)} 的效果`;
        this.addLog(`${this.who(s)} 打出 ${cardText(c[0])}，抵消了${what}。`, { type: 'use', from: s, to: [target], cards: c });
        cancelled = !cancelled;
        played = true;
        break;
      }
      if (!played) return cancelled;
    }
  }

  /**
   * 【识破】的敌友含义：blocks 为 true 表示这张【识破】使锦囊对 target 失效，否则表示让锦囊重新生效。
   * 挡掉有害锦囊 = 帮助 target；挡掉有益锦囊 = 敌对；让锦囊重新生效则反过来（分量减半）。
   */
  private markShipo(s: number, trick: string, target: number, blocks: boolean): void {
    const harmful = HARMFUL_TRICK_KEYS.has(trick);
    const w = blocks ? HELP_WEIGHT.cover : HELP_WEIGHT.cover / 2;
    if (harmful === blocks) this.markHelp(s, target, w);
    else this.markHostile(s, target, w);
  }

  /**
   * 询问某角色打出一张指定种类的牌；合法则移入弃牌堆并返回打出的牌。
   * allowPair 为 true 时，也可以用两张同颜色手牌代替（铁脊长枪）。
   */
  /** 请求使用或打出一张牌；打出成功时消耗【隐忍】强化（【鱼鳞甲】是弃牌，不算） */
  async askForCard(seat: number, accept: string[], reason: RespondReason, allowPair = false): Promise<Card[] | null> {
    const res = await this.askForCardInner(seat, accept, reason, allowPair);
    this.lastBoost = !!res && reason.kind !== 'yulin' && this.consumeBoost(seat);
    return res;
  }

  private async askForCardInner(seat: number, accept: string[], reason: RespondReason, allowPair: boolean): Promise<Card[] | null> {
    const p = this.players[seat];
    // 隐忍：被封牌的角色不能使用或打出牌（鱼鳞甲是弃牌，不受影响）
    if (this.locked.has(seat) && reason.kind !== 'yulin') return null;
    // 宝刀：手牌中的装备牌可当作【斩】打出
    if (accept.includes('zhan') && this.is(seat, 'huangzhong')) {
      accept = [...new Set([...accept, ...p.hand.filter(isEquip).map((c) => c.key)])];
    }
    const pairOk = allowPair && hasSameColorPair(p.hand);
    // 死战：装备区的牌可当【避】打出
    const equipDodge = accept.length === 1 && accept[0] === 'bi' && this.is(seat, 'taishici') ? Object.values(p.equips).filter((c): c is Card => !!c) : [];
    if (!p.hand.some((c) => accept.includes(c.key)) && !pairOk && equipDodge.length === 0) return null;
    const ans = await this.ask(seat, {
      type: 'respond',
      accept,
      reason,
      ...(pairOk ? { allowPair: true } : {}),
      ...(equipDodge.length > 0 ? { equipDodge } : {}),
    });
    if (ans === null) return null;
    const fromEquip = typeof ans === 'number' ? equipDodge.find((c) => c.id === ans) : undefined;
    if (fromEquip) {
      const slot = (Object.keys(p.equips) as EquipSlot[]).find((k) => p.equips[k] === fromEquip)!;
      delete p.equips[slot];
      this.discard([fromEquip]);
      this.addLog(`${this.who(seat)} 发动【死战】。`);
      this.drawCards(p, SIZHAN_DRAW);
      return [fromEquip];
    }
    let cards: Card[];
    if (Array.isArray(ans)) {
      if (!pairOk || ans[0] === ans[1]) return null;
      const pair = ans.map((id) => p.hand.find((c) => c.id === id));
      if (pair.some((c) => !c) || isRed(pair[0]!) !== isRed(pair[1]!)) return null;
      cards = pair as Card[];
    } else {
      const card = p.hand.find((c) => c.id === ans);
      if (!card || !accept.includes(card.key)) return null;
      cards = [card];
    }
    for (const c of cards) this.takeFromHand(p, c.id);
    this.discard(cards);
    return cards;
  }

  // ───────────── 体力 ─────────────

  /** via：造成伤害的牌（用于鱼鳞甲判断） */
  /** 返回实际造成的伤害值 */
  /** boosted：已计入【隐忍】强化（舍身转移伤害时避免重复 +1） */
  async damage(source: number | null, target: number, amount: number, via?: 'zhan', boosted = false): Promise<number> {
    if (!boosted && this.boostedBy(source)) {
      amount += 1;
      boosted = true;
      this.addLog(`${this.who(source!)} 的【隐忍】强化：伤害 +1。`);
    }
    if (this.shielded.has(target)) {
      this.addLog(`${this.who(target)} 的【隐忍】防止了 ${amount} 点伤害。`);
      return 0;
    }
    if (await this.sheshen(source, target, amount, via, boosted)) return 0;
    const t = this.players[target];
    const armor = t.equips.armor?.key;

    if (via === 'zhan' && armor === 'yulinjia' && this.yulinTurn.get(target) !== this.turn) {
      this.yulinTurn.set(target, this.turn);
      const paid = await this.askForCard(target, BASIC_KEYS, { kind: 'yulin', source });
      if (paid) {
        this.addLog(`${this.who(target)} 发动【鱼鳞甲】，弃置 ${cardText(paid[0])} 防止了伤害。`, { type: 'use', from: target, to: [], cards: paid });
        return 0;
      }
    }
    if (via === 'zhan' && armor === 'suozijia' && source !== null && this.distance(source, target) >= 2) {
      amount -= 1;
      this.addLog(`${this.who(target)} 的【锁子甲】令伤害 -1。`);
      if (amount <= 0) return 0;
    }
    if (armor === 'huxinjing' && t.hp === 1) {
      amount -= 1;
      const mirror = t.equips.armor!;
      delete t.equips.armor;
      this.discard([mirror]);
      this.addLog(`${this.who(target)} 的【护心镜】令伤害 -1，随后碎裂（弃置）。`);
      if (amount <= 0) return 0;
    }

    t.hp -= amount;
    this.damageTaken[target] = (this.damageTaken[target] ?? 0) + amount;
    if (source === this.current && source !== target) this.dealtDamageThisTurn = true;
    const from = source === null ? '' : `${this.who(source)} 对 `;
    this.addLog(`${from}${this.who(target)} 造成 ${amount} 点伤害，体力 ${t.hp}/${t.maxHp}。`, { type: 'damage', seat: target, amount, from: source });
    if (t.hp <= 0) await this.dying(target, source);

    // 霸业
    if (source !== null && this.is(source, 'caocao')) {
      this.addLog(`${this.who(source)} 发动【霸业】。`);
      this.drawCards(this.players[source], 1);
    }
    // 谋算
    if (this.is(target, 'guojia')) await this.mousuan(target);
    return amount;
  }

  /** 典韦【舍身】：代替距离 1 的其他角色承受伤害，然后摸牌；发动返回 true（原目标不受伤害） */
  private async sheshen(source: number | null, target: number, amount: number, via?: 'zhan', boosted = false): Promise<boolean> {
    if (this.sheshenTurn === this.turn) return false;
    const dw = this.players.find((x) => this.is(x.seat, 'dianwei'));
    if (!dw || dw.seat === target || this.shielded.has(dw.seat) || this.distance(dw.seat, target) !== 1) return false;
    const ans = await this.ask(dw.seat, {
      type: 'choose',
      reason: 'sheshen',
      target,
      amount,
      options: [
        { id: 'yes', label: `发动【舍身】：代替 ${this.who(target)} 承受 ${amount} 点伤害，然后摸 ${SHESHEN_DRAW} 张牌` },
        { id: 'no', label: '不发动' },
      ],
    });
    if (ans !== 'yes') return false;
    this.sheshenTurn = this.turn;
    this.addLog(`${this.who(dw.seat)} 发动【舍身】，代替 ${this.who(target)} 承受伤害。`, {
      type: 'use',
      from: dw.seat,
      to: [target],
      cards: [],
      skill: '舍身',
    });
    this.markHelp(dw.seat, target, HELP_WEIGHT.protect);
    await this.damage(source, dw.seat, amount, via, boosted);
    if (dw.alive) this.drawCards(dw, SHESHEN_DRAW);
    return true;
  }

  async mousuan(seat: number): Promise<void> {
    const top = this.takeTop(SKILL_TUNING.mousuanView);
    if (top.length === 0) return;
    const [got] = this.validSelection(
      await this.ask(seat, { type: 'selectCards', cards: top, count: 1, reason: 'mousuan' }),
      top,
      1,
    );
    let rest = top.filter((c) => c !== got);
    if (rest.length > 1) {
      const order = await this.ask(seat, { type: 'orderCards', cards: rest, reason: 'mousuan' });
      const sorted = this.validSelection(order, rest, rest.length);
      rest = sorted;
    }
    this.putOnTop(rest);
    this.players[seat].hand.push(got);
    this.addLog(`${this.who(seat)} 发动【谋算】，观看牌堆顶 ${top.length} 张牌并获得 1 张。`);
  }

  recover(seat: number, amount: number): void {
    const p = this.players[seat];
    const before = p.hp;
    p.hp = Math.min(p.maxHp, p.hp + amount);
    if (p.hp <= before) return;
    this.addLog(`${this.who(seat)} 回复 ${p.hp - before} 点体力，体力 ${p.hp}/${p.maxHp}。`, { type: 'recover', seat, amount: p.hp - before });
  }

  /** 使用或打出一张牌：有【隐忍】强化次数时消耗一次，返回是否强化 */
  private consumeBoost(seat: number): boolean {
    if (!(this.empower[seat] > 0)) return false;
    this.empower[seat]--;
    this.addLog(`${this.who(seat)} 的【隐忍】强化生效（剩余 ${this.empower[seat]} 张）。`);
    return true;
  }

  /** 在强化状态下结算 fn（boosted 为 false 时直接结算） */
  private async withBoost<T>(seat: number, boosted: boolean, fn: () => Promise<T>): Promise<T> {
    if (!boosted) return fn();
    this.boostStack.push(seat);
    try {
      return await fn();
    } finally {
      this.boostStack.pop();
    }
  }

  private boostedBy(seat: number | null): boolean {
    return seat !== null && this.boostStack.includes(seat);
  }

  /** 7、8 人局中最后存活的内奸拥有【隐忍】 */
  hasYinren(seat: number): boolean {
    const p = this.players[seat];
    if (!YINREN_PLAYERS.has(this.players.length) || p.role !== 'renegade' || !p.alive) return false;
    return !this.players.some((x) => x !== p && x.alive && x.role === 'renegade');
  }

  /** 内奸【隐忍】：拥有此技能后首次濒死时，可亮出身份、回复至 1 点体力，并防止伤害直到自己的回合开始 */
  private async yinren(seat: number): Promise<boolean> {
    if (this.yinrenUsed.has(seat) || !this.hasYinren(seat)) return false;
    this.yinrenUsed.add(seat);
    const ans = await this.ask(seat, {
      type: 'choose',
      reason: 'yinren',
      options: [
        { id: 'yes', label: '发动【隐忍】：亮出内奸身份，回复至 1 点体力，并防止所有伤害直到你的回合开始' },
        { id: 'no', label: '不发动（之后不能再发动）' },
      ],
    });
    if (ans !== 'yes') return false;
    const p = this.players[seat];
    this.revealed.add(seat);
    this.addLog(`${this.who(seat)} 发动【隐忍】，亮出身份：【内奸】！`, { type: 'use', from: seat, to: [], cards: [], skill: '隐忍' });
    this.recover(seat, 1 - p.hp);
    this.shielded.add(seat);
    return true;
  }

  async dying(seat: number, killer: number | null): Promise<void> {
    const t = this.players[seat];
    this.addLog(`${this.who(seat)} 进入濒死状态！`, { type: 'dying', seat });
    if (await this.yinren(seat)) return;
    for (const s of this.aliveFrom(this.current)) {
      while (t.hp <= 0) {
        const card = await this.askForCard(s, ['yao'], { kind: 'save', dying: seat });
        if (!card) break;
        this.addLog(`${this.who(s)} 对 ${this.who(seat)} 使用了 ${cardText(card[0])}。`, { type: 'use', from: s, to: [seat], cards: card });
        this.markHelp(s, seat, HELP_WEIGHT.save);
        this.recover(seat, this.lastBoost ? 2 : 1);
        // 桃园
        if (s !== seat && this.isLord(seat, 'liubei') && this.faction(s) === 'shu') {
          this.addLog(`${this.who(seat)} 的【桃园】触发。`);
          this.drawCards(t, 1);
        }
      }
      if (t.hp > 0) return;
    }
    await this.kill(seat, killer);
  }

  async kill(seat: number, killer: number | null): Promise<void> {
    const t = this.players[seat];
    t.alive = false;
    this.deathOrder.push(seat);
    this.addLog(`${this.who(seat)} 阵亡，身份是【${ROLE_NAME[t.role]}】。`, { type: 'death', seat });
    this.discard(t.hand.splice(0));
    this.discard(this.takeAllEquips(t));
    this.discard(t.judge.splice(0).map((j) => j.card));

    const winner = this.checkVictory();
    if (winner) throw new GameOver(winner);

    // 江东
    if (this.faction(seat) === 'wu') {
      for (const s of this.aliveFrom(0)) {
        if (this.isLord(s, 'sunquan')) {
          this.addLog(`${this.who(s)} 的【江东】触发。`);
          this.recover(s, 1);
        }
      }
    }

    // 过关：关羽自己的回合中人数降到 3 人时，本回合立即多 1 次【斩】
    if (this.players.filter((p) => p.alive).length === 3 && this.guoguan(this.current)) this.zhanLimit += 1;

    // 聚众
    for (const s of this.aliveFrom(0)) {
      const gained = this.juzhongGained.get(s) ?? 0;
      if (!this.is(s, 'zhangjiao') || gained >= JUZHONG_MAX) continue;
      this.juzhongGained.set(s, gained + 1);
      const z = this.players[s];
      z.maxHp += 1;
      this.addLog(`${this.who(s)} 发动【聚众】，体力上限 +1。`);
      this.recover(s, 1);
    }

    if (killer === null || killer === seat) return;
    const k = this.players[killer];
    if (!k.alive) return;
    if (t.role === 'rebel') {
      this.addLog(`${this.who(killer)} 击杀反贼，奖励摸 3 张牌。`);
      this.drawCards(k, 3);
    } else if (t.role === 'loyalist' && k.role === 'lord') {
      this.addLog(`主公误杀忠臣，弃置所有手牌和装备！`);
      this.discard(k.hand.splice(0));
      this.discard(this.takeAllEquips(k));
    }
  }

  private takeAllEquips(p: Player): Card[] {
    const cards = Object.values(p.equips).filter((c): c is Card => !!c);
    p.equips = {};
    return cards;
  }

  checkVictory(): Winner | null {
    const alive = this.players.filter((p) => p.alive);
    const lord = this.players.find((p) => p.role === 'lord')!;
    if (!lord.alive) {
      return alive.length === 1 && alive[0].role === 'renegade' ? 'renegade' : 'rebel';
    }
    if (alive.every((p) => p.role === 'lord' || p.role === 'loyalist')) return 'lord';
    return null;
  }

  // ───────────── 弃牌阶段 ─────────────

  async discardPhase(p: Player): Promise<void> {
    const excess = p.hand.length - Math.max(0, p.hp);
    if (excess <= 0) return;
    const ids = await this.ask(p.seat, { type: 'discard', count: excess });
    const unique = [...new Set(ids)];
    const valid = unique.length === excess && unique.every((id) => p.hand.some((c) => c.id === id));
    const chosen = valid ? unique : p.hand.slice(-excess).map((c) => c.id);
    const cards = chosen.map((id) => this.takeFromHand(p, id)!);
    this.discard(cards);
    this.beginResolution();
    this.addLog(`${this.who(p.seat)} 弃置了 ${cards.map(cardText).join('、')}。`, { type: 'discard', from: p.seat, cards });
  }

  // ───────────── 视图与询问 ─────────────

  async ask<R extends Request>(seat: number, req: R): Promise<Response<R>> {
    return this.controllers[seat].decide(this.view(seat), req);
  }

  view(seat: number): GameView {
    return {
      me: seat,
      current: this.current,
      phase: this.phase,
      turn: this.turn,
      drawPileCount: this.drawPile.length,
      discardPileCount: this.discardPile.length,
      zhanUsed: this.zhanUsed,
      zhanLimit: this.zhanLimit,
      hostility: this.hostility.map((row) => [...row]),
      help: this.help.map((row) => [...row]),
      deathOrder: [...this.deathOrder],
      players: this.players.map((p) => ({
        seat: p.seat,
        name: p.name,
        general: p.general,
        role: p.seat === seat || p.role === 'lord' || !p.alive || this.revealed.has(p.seat) ? p.role : null,
        hp: p.hp,
        maxHp: p.maxHp,
        alive: p.alive,
        handCount: p.hand.length,
        equips: { ...p.equips },
        judge: p.judge.map((j) => ({ ...j })),
        hand: p.seat === seat ? [...p.hand] : null,
        shielded: this.shielded.has(p.seat),
        damageTaken: this.damageTaken[p.seat] ?? 0,
        empower: this.empower[p.seat] ?? 0,
        yinren: this.hasYinren(p.seat) && !this.yinrenUsed.has(p.seat) && p.seat === seat,
      })),
    };
  }

  /** 所有牌的总数（用于校验牌不会凭空增减） */
  totalCards(): number {
    let n = this.drawPile.length + this.discardPile.length + (this.pendingJudge ? 1 : 0);
    for (const p of this.players) n += p.hand.length + Object.values(p.equips).filter(Boolean).length + p.judge.length;
    return n;
  }
}

function isEquip(c: Card): boolean {
  return cardDef(c.key).kind === 'equip';
}

function hasSameColorPair(hand: Card[]): boolean {
  const red = hand.filter(isRed).length;
  return red >= 2 || hand.length - red >= 2;
}

function hasSameSuitPair(hand: Card[]): boolean {
  const seen = new Set<string>();
  for (const c of hand) {
    if (seen.has(c.suit)) return true;
    seen.add(c.suit);
  }
  return false;
}

function equipCount(p: Player): number {
  return Object.values(p.equips).filter(Boolean).length;
}
