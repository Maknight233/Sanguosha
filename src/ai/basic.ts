import { BASIC_KEYS, cardDef, isRed, TIANLEI_DAMAGE, tianleiHit } from '../data/cards';
import { isVersus, ROLE_TABLE, seatDistance, YINREN_DAMAGE } from '../engine/game';
import type {
  Card,
  CardPick,
  ChoiceOption,
  ChooseReason,
  Controller,
  GameView,
  JudgeInfo,
  PindianInfo,
  PlayAction,
  PlayOption,
  PlayerPublic,
  Request,
  RespondReason,
  Response,
  SkillOption,
} from '../engine/types';

/**
 * 基础 AI：只使用自己能看到的信息（GameView）。
 * 根据「已知身份」「身份排除」和「身份倾向分」（由公开的敌对 / 帮助行为连锁推理得出）判断敌友。
 */

export type Relation = 'friend' | 'enemy' | 'neutral';

/** 拼点 AI 参数 */
export const PINDIAN_AI = {
  /** 程普【老将】加成（与引擎 SKILL_TUNING.laojiangBonus 一致） */
  laojiangBonus: 2,
  /** 拼点愿意花掉的牌的最高价值（【避】5.5、【药】7 不拿去拼） */
  valueLimit: 5,
  /** 被【搏虎】/【乱策】拼点时愿意花掉的牌的最高价值 */
  defendLimit: 5.5,
  /** 估计对方从几张牌里挑最大的 */
  oppPicks: 3,
  /** 乱策：队友手牌须比敌人多几张 */
  luanceFriendLead: 2,
  /** 乱策：愿意弃置的牌的最高价值 */
  luancePayLimit: 4,
};

/** 选将偏好：越靠前越优先 */
const GENERAL_PREFERENCE = [
  'zhugeliang', 'guojia', 'caocao', 'liubei', 'zhaoyun', 'sunquan', 'ganning', 'lvbu', 'zhangliao', 'lusu',
  'weiyan', 'zhangfei', 'xiahoudun', 'machao', 'zhoutai', 'huaxiong', 'daqiao', 'mizhu', 'caiwenji', 'pangde', 'xuchu', 'fazheng', 'chengpu', 'jiaxu', 'xunyu', 'zhouyu', 'gongsunzan', 'dongzhuo', 'huatuo', 'lvmeng', 'yuji', 'luxun', 'taishici',
  'huangzhong', 'caoren', 'zhangjiao', 'guanyu', 'dianwei', 'simayi', 'diaochan',
];
/** 选将扰动幅度：偏好表中相差不到这么多名的武将可能互换顺序 */
const PICK_JITTER = 8;

/** 简单字符串哈希（FNV-1a），用于不依赖随机数的确定性扰动 */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h;
}

/** 内奸要活到最后：按模拟中内奸胜率排序（关羽、刘备、司马懿明显更高） */
const RENEGADE_PREFERENCE = ['guanyu', 'liubei', 'simayi', 'zhaoyun', 'huatuo'];

/** 内奸帮反贼期间，主公体力降到此值及以下时转回帮主公 */
export const LORD_DANGER_HP = 4;

/** 内奸策略参数（模拟脚本可以修改来对比效果） */
export const RENEGADE_TUNING = {
  /** 反贼只剩 1 人且忠臣还活着时进入「平衡」：打忠臣、不打反贼，避免被主公方 2 打 1 */
  balance: true,
  /** 平衡模式下救濒死的最后一个反贼 */
  saveLastRebel: true,
  /** 抢人头：优先补刀体力 ≤1 的反贼，拿 3 张奖励牌 */
  stealKills: true,
  /** 平衡模式下也抢最后一个反贼的人头（会导致 1 打 2） */
  stealLastRebel: false,
  /** 平衡模式下主公体力 ≤ 此值时转回帮主公（0 = 不转；模拟中 1 效果最好） */
  balanceLordDangerHp: 1,
  /** 多忠臣局（7、8 人）：忠臣人数 ≥ 反贼人数时就进入平衡（打忠臣、保反贼）。'yinren' = 仅在拥有或刚发动【隐忍】时 */
  balanceWide: 'off' as 'off' | 'yinren' | 'always',
  /** 【隐忍】主动发动：never 只留着保命；kill 能打死敌人时重创；all 另外在 X 达到 drawAt 时摸牌 */
  yinrenActive: 'kill' as 'never' | 'kill' | 'all',
  yinrenDrawAt: 3,
};

/** 焚城发动门槛（敌人 +1、可击杀 +3，队友 −1.5、会被打死 −5） */
export const FENCHENG_MIN_SCORE = 2;

/** 身份倾向分超过此值才认定敌友（+1 确定忠，−1 确定反） */
export const LEAN_THRESHOLD = 0.4;
/** 内奸嫌疑分参数（模拟脚本可修改来对比） */
export const SUSPICION_TUNING = {
  enabled: true,
  /** 嫌疑分达到此值才认定为疑似内奸（1.0 约等于两边各一次完整的行为） */
  threshold: 1.0,
};
/** AI 伪装参数（普通难度；模拟脚本可修改来对比） */
export const DISGUISE_TUNING = {
  enabled: true,
  /** 每名反贼成为「潜伏型」的概率 */
  rebelLurkChance: 0.5,
  /** 潜伏最多持续的轮数（2 轮时反贼胜率 −3%，1 轮基本不变） */
  lurkRounds: 1,
  /** 主公体力 ≤ 此值时潜伏结束 */
  lurkLordHp: 2,
};

/** 连锁推理的迭代轮数 */
const LEAN_ITERATIONS = 8;

const HARMFUL_TRICKS = new Set(['jieying', 'cefan', 'xiwen', 'biwu', 'duanliang', 'junling', 'tianlei']);
const EQUIP_STEAL_ORDER = ['armor', 'weapon', 'horsePlus', 'horseMinus'] as const;

/**
 * AI 难度：普通；简单（固定短板：随便挑目标、不用【识破】、只救自己和主公）。
 * 简单 AI 仍做身份推理——否则简单忠臣几乎不出手，玩家当主公反而更难（实测主公胜率 62% → 24%）。
 */
export type AiLevel = 'easy' | 'normal';
export const AI_LEVEL_NAME: Record<AiLevel, string> = { easy: '简单', normal: '普通' };

export class BasicAI implements Controller {
  constructor(readonly level: AiLevel = 'normal') {}

  async decide<R extends Request>(view: GameView, req: R): Promise<Response<R>> {
    return new Brain(view, this.level).decide(req) as Response<R>;
  }
}

/** 诊断 / 测试用：从 view 视角看 seat 的倾向分与内奸嫌疑分 */
export function inferOf(view: GameView, seat: number): { lean: number; suspicion: number; suspected: boolean } {
  const b = new Brain(view);
  return { lean: b.lean(seat), suspicion: b.suspicion(seat), suspected: b.suspectedRenegade(seat) };
}

/** 某人对某座位的身份判断（界面「读局」用） */
export interface Opinion {
  /** 倾向分：+1 偏忠 … −1 偏反 */
  lean: number;
  /** 判断结论 */
  verdict: 'loyal' | 'rebel' | 'unclear';
  suspicion: number;
  suspected: boolean;
  /** 仅 AI 视角：把对方当作敌 / 友 / 中立 */
  relation?: Relation;
}

/** 旁观者视角：只用公开信息（主公、阵亡者、已亮身份者），去掉观看者自己的身份与手牌 */
export function observerView(view: GameView): GameView {
  return {
    ...view,
    players: view.players.map((p) => (p.seat === view.me && p.role !== 'lord' && p.alive ? { ...p, role: null, hand: null, yinren: false } : p)),
  };
}

function opinionsOf(view: GameView, observer: boolean): (Opinion | null)[] {
  const b = new Brain(view, 'normal', observer);
  return view.players.map((p) => {
    if (!p.alive || p.role !== null || (!observer && p.seat === view.me)) return null;
    const lean = b.lean(p.seat);
    return {
      lean,
      verdict: lean > LEAN_THRESHOLD ? 'loyal' : lean < -LEAN_THRESHOLD ? 'rebel' : 'unclear',
      suspicion: b.suspicion(p.seat),
      suspected: b.suspectedRenegade(p.seat),
      ...(observer ? {} : { relation: b.relation(p.seat) }),
    };
  });
}

/** 旁观者对每个座位的判断；身份已公开或已阵亡的为 null */
export function observerOpinions(view: GameView): (Opinion | null)[] {
  return opinionsOf(observerView(view), true);
}

/** view.me 这名 AI 对每个座位的判断（含敌友）；自己、已公开身份、阵亡者为 null，但已知身份的也给出敌友 */
export function aiOpinions(view: GameView): { opinions: (Opinion | null)[]; relations: (Relation | null)[]; mode: string | null } {
  const b = new Brain(view);
  return {
    opinions: opinionsOf(view, false),
    relations: view.players.map((p) => (p.alive && p.seat !== view.me ? b.relation(p.seat) : null)),
    mode: view.players[view.me].role === 'renegade' ? b.renegadeMode() : null,
  };
}

/** 针对单次决策的分析器 */
class Brain {
  readonly me: PlayerPublic;
  readonly hand: Card[];
  readonly lord: PlayerPublic;

  private leanCache: number[] | null = null;

  constructor(
    readonly view: GameView,
    readonly level: AiLevel = 'normal',
    /** 旁观者模式：观看者本人也作为被推理对象 */
    readonly observer = false,
  ) {
    this.me = view.players[view.me];
    this.hand = this.me.hand ?? [];
    this.lord = view.players.find((p) => p.role === 'lord')!;
  }

  decide(req: Request): Response<Request> {
    switch (req.type) {
      case 'chooseGeneral':
        return this.chooseGeneral(req.options);
      case 'play':
        return this.play(req.options, req.skills);
      case 'respond':
        return this.respond(req.accept, req.reason, !!req.allowPair, req.equipDodge ?? []);
      case 'discard':
        return this.cheapest(this.hand, req.count).map((c) => c.id);
      case 'chooseCard':
        return this.pickFrom(req.target, req.equips, req.handCount);
      case 'choose':
        if (req.reason === 'sheshen') return this.sheshen(req.target!, req.amount ?? 1) ? 'yes' : 'no';
        if (req.reason === 'dingce') return this.dingce(req.judge!);
        if (req.reason === 'liuxing') return this.liuxing(req.target!);
        if (req.reason === 'bashi') return this.bashi(req.target!, req.options);
        if (req.reason === 'qingyin') return this.qingyin(req.target!, req.options);
        return this.choose(req.reason, req.options);
      case 'selectCards':
        if (req.reason === 'huoxin') return this.cheapest(req.cards, req.count).map((c) => c.id);
        if (req.reason === 'pindian' && req.pindian) return [this.pindianCard(req.cards, req.pindian).id];
        if (req.reason === 'xiaoyong' || req.reason === 'duoxie') return [this.bestEquipToRemove(req.cards).id];
        return this.best(req.cards, req.count).map((c) => c.id);
      case 'orderCards':
        return this.best(req.cards, req.cards.length).map((c) => c.id);
    }
  }

  // ───────────── 敌友判断 ─────────────

  private hostile(from: number, to: number): boolean {
    return (this.view.hostility[from]?.[to] ?? 0) > 0;
  }

  private aliveOthers(): PlayerPublic[] {
    return this.view.players.filter((p) => p.alive && p.seat !== this.me.seat);
  }

  /**
   * 身份排除：未知身份的存活角色可能是哪些身份。
   * 总身份按人数查 ROLE_TABLE（5 人：1 主公 + 1 忠臣 + 2 反贼 + 1 内奸），去掉已知身份（自己、主公、阵亡者）后剩下的就是未知者的候选。
   */
  private unknownRoles(): Set<string> {
    const pool: string[] = ROLE_TABLE[this.view.players.length].filter((r) => r !== 'lord');
    for (const p of this.view.players) {
      if (p.role === null || p.role === 'lord') continue;
      const i = pool.indexOf(p.role);
      if (i >= 0) pool.splice(i, 1);
    }
    return new Set(pool);
  }

  /** 身份倾向的锚点：已知（或可推出）身份的角色固定为 +1 / −1 / 0（内奸） */
  private anchor(seat: number): number | null {
    let role: string | null = this.view.players[seat].role;
    if (role === null) {
      const pool = this.unknownRoles();
      if (pool.size === 1) role = [...pool][0];
    }
    // 内奸看自己时不当锚点（自己不在忠反任一边）
    if (role === null || (role === 'renegade' && seat === this.me.seat)) return null;
    return role === 'lord' || role === 'loyalist' ? 1 : role === 'rebel' ? -1 : 0;
  }

  /**
   * 身份倾向分（−1 偏反 … +1 偏忠），从自己的视角连锁推理：
   * 某人的分数 = Σ（他对 t 的帮助 − 他对 t 的敌对）× t 的当前分数。
   * 与行为发生顺序无关；每轮限制在 ±1 内并与上一轮取平均，避免越滚越大。
   */
  lean(seat: number): number {
    if (!this.leanCache) {
      const n = this.view.players.length;
      const anchors = this.view.players.map((p) => this.anchor(p.seat));
      let lean = anchors.map((a) => a ?? 0);
      for (let it = 0; it < LEAN_ITERATIONS; it++) {
        lean = lean.map((cur, x) => {
          if (anchors[x] !== null) return anchors[x]!;
          let raw = 0;
          for (let t = 0; t < n; t++) {
            if (t === x) continue;
            raw += ((this.view.help[x]?.[t] ?? 0) - (this.view.hostility[x]?.[t] ?? 0)) * lean[t];
          }
          return (cur + Math.max(-1, Math.min(1, raw))) / 2;
        });
      }
      this.leanCache = lean;
    }
    return this.leanCache[seat];
  }

  private looksLoyal = (seat: number) => this.lean(seat) > LEAN_THRESHOLD;
  private looksRebel = (seat: number) => this.lean(seat) < -LEAN_THRESHOLD;

  /**
   * 内奸嫌疑分：把某人的行为分成「帮主公方」（帮偏忠的人、打偏反的人）和「帮反贼方」（帮偏反的人、打偏忠的人），
   * 取两者中较小的一方的累计量——只有两边都做过才会升高。
   * 只对身份未知的人计算；身份排除已确定内奸不在未知者中时为 0。
   */
  suspicion(seat: number): number {
    const p = this.view.players[seat];
    if (p.role !== null || (!this.observer && seat === this.me.seat) || !this.unknownRoles().has('renegade')) return 0;
    let proLord = 0;
    let proRebel = 0;
    for (let t = 0; t < this.view.players.length; t++) {
      if (t === seat) continue;
      const l = this.lean(t);
      const help = this.view.help[seat]?.[t] ?? 0;
      const hit = this.view.hostility[seat]?.[t] ?? 0;
      proLord += help * Math.max(l, 0) + hit * Math.max(-l, 0);
      proRebel += help * Math.max(-l, 0) + hit * Math.max(l, 0);
    }
    return Math.min(proLord, proRebel);
  }

  suspectedRenegade(seat: number): boolean {
    return SUSPICION_TUNING.enabled && this.suspicion(seat) >= SUSPICION_TUNING.threshold;
  }

  relation(seat: number): Relation {
    if (seat === this.me.seat) return 'friend';
    const base = this.baseRelation(seat);
    if (base !== 'enemy' || this.hostile(seat, this.me.seat)) return base;
    // 伪装：潜伏的反贼不打主公、只还击
    return this.lurking() ? 'neutral' : base;
  }

  /** 潜伏型反贼：开局几轮内不暴露，有人阵亡、主公体力低、自己濒危或轮数到了就结束 */
  lurking(): boolean {
    // 1v1、2v2 没有身份可隐藏
    if (!DISGUISE_TUNING.enabled || this.level === 'easy' || this.observer || this.me.role !== 'rebel' || this.versus) return false;
    const v = this.view;
    const n = v.players.length;
    const lurker = hash(`lurk|${this.me.seat}|${v.players.map((p) => p.general).join(',')}`) % 1000 < DISGUISE_TUNING.rebelLurkChance * 1000;
    return lurker && v.deathOrder.length === 0 && this.lord.hp > DISGUISE_TUNING.lurkLordHp && this.me.hp > 1 && v.turn <= DISGUISE_TUNING.lurkRounds * n;
  }

  /** 对战模式（1v1、2v2）：身份全部公开 */
  private get versus(): boolean {
    return isVersus(this.view.players.length);
  }

  private baseRelation(seat: number): Relation {
    const known = this.view.players[seat].role;
    if (known !== null && this.versus) return this.relationToRole(known, seat);
    if (known === null) {
      // 未知身份者如果只可能是某一类，直接按该身份判断
      const pool = this.unknownRoles();
      if (pool.size === 1) return this.relationToRole([...pool][0], seat);
    }
    return this.relationByBehavior(seat);
  }

  /** 已知（或可推出）对方身份时的敌友关系 */
  private relationToRole(role: string, seat: number): Relation {
    const mine = this.me.role;
    if (mine === 'renegade') return role === 'lord' ? this.relationByBehavior(seat) : 'enemy';
    if (role === 'renegade') return 'enemy';
    const team = (r: string) => (r === 'lord' || r === 'loyalist' ? 'lord' : r);
    return team(role) === team(mine!) ? 'friend' : 'enemy';
  }

  private relationByBehavior(seat: number): Relation {
    const me = this.me.seat;
    const lord = this.lord.seat;
    // 打过我、又不像队友的人：还手
    const attacksMe = this.hostile(seat, me);

    switch (this.me.role) {
      // 疑似内奸：不当队友（不救、不给牌、不替他挡锦囊），但原本是敌人的仍是敌人
      case 'lord':
      case 'loyalist':
        if (seat === lord) return 'friend';
        if (this.looksRebel(seat)) return 'enemy';
        if (this.looksLoyal(seat)) return this.suspectedRenegade(seat) ? 'neutral' : 'friend';
        return attacksMe ? 'enemy' : 'neutral';
      case 'rebel':
        if (seat === lord) return 'enemy';
        if (this.looksLoyal(seat)) return 'enemy';
        if (this.looksRebel(seat)) return this.suspectedRenegade(seat) ? 'neutral' : 'friend';
        return attacksMe ? 'enemy' : 'neutral';
      case 'renegade': {
        const mode = this.renegadeMode();
        if (seat === lord) {
          // 只剩自己和主公时，主公就是最后的敌人
          if (this.aliveOthers().length === 1) return 'enemy';
          // 帮反贼时可以攻击主公，但主公只剩 1 点体力时不补刀
          if (mode === 'rebels') return this.lord.hp > 1 ? 'enemy' : 'neutral';
          // 主公打了自己也会还手，同样不补刀
          if (attacksMe) return this.lord.hp > 1 ? 'enemy' : 'neutral';
          return 'friend';
        }
        // 反贼全灭：内奸必须自己动手，先清掉主公以外的所有人（含另一名内奸）
        if (this.aliveCounts().rebels === 0) return 'enemy';
        if (mode === 'balance') {
          if (this.likelyRebel(seat)) return 'neutral';
          if (this.likelyLoyal(seat)) return 'enemy';
          return attacksMe ? 'enemy' : 'neutral';
        }
        if (attacksMe) return 'enemy';
        if (mode === 'lord') return this.looksRebel(seat) || this.view.players[seat].role === 'rebel' ? 'enemy' : 'neutral';
        // 帮反贼时，攻击疑似忠臣
        if (mode === 'rebels') return this.looksLoyal(seat) ? 'enemy' : 'neutral';
        return 'neutral'; // 第一个角色阵亡前按兵不动
      }
      default:
        return 'neutral';
    }
  }

  /**
   * 内奸策略：第一个角色阵亡前按兵不动；
   * 第一个阵亡的是忠臣 → 帮主公；是反贼 → 帮反贼，但反贼人数追平主公方后转回帮主公。
   */
  renegadeMode(): 'wait' | 'lord' | 'rebels' | 'balance' {
    const first = this.view.deathOrder[0];
    const { rebels, loyalists, loyalistAlive } = this.aliveCounts();
    if (first === undefined) return 'wait';
    if (this.wideBalance() && rebels >= 1 && loyalists >= rebels && this.lord.hp > RENEGADE_TUNING.balanceLordDangerHp) return 'balance';
    // 平衡：最后一个反贼一死，内奸就要面对主公 + 忠臣，所以转打忠臣、保住反贼
    if (RENEGADE_TUNING.balance && rebels === 1 && loyalistAlive && this.lord.hp > RENEGADE_TUNING.balanceLordDangerHp)
      return 'balance';
    if (this.view.players[first].role !== 'rebel') return 'lord';
    // 动态切换：反贼人数不再少于主公方时（如忠臣也阵亡了），转回帮主公
    const lordSide = 1 + loyalists;
    return rebels >= lordSide || this.lord.hp <= LORD_DANGER_HP ? 'lord' : 'rebels';
  }

  /** 是否使用多忠臣局的「宽平衡」 */
  private wideBalance(): boolean {
    const mode = RENEGADE_TUNING.balanceWide;
    if (mode === 'off' || !RENEGADE_TUNING.balance || this.aliveCounts().loyalists < 2) return false;
    const me = this.view.players[this.me.seat];
    return mode === 'always' || !!me.yinren || !!me.shielded;
  }

  /** 存活的反贼、忠臣人数（总数按人数查表，减去阵亡者） */
  private aliveCounts(): { rebels: number; loyalists: number; loyalistAlive: boolean } {
    const roles = ROLE_TABLE[this.view.players.length];
    const left = (role: string) => roles.filter((r) => r === role).length - this.view.players.filter((p) => !p.alive && p.role === role).length;
    const loyalists = left('loyalist');
    return { rebels: left('rebel'), loyalists, loyalistAlive: loyalists > 0 };
  }

  /** 内奸视角：某人是否（很可能）是反贼 */
  private likelyRebel(seat: number): boolean {
    const p = this.view.players[seat];
    if (!p.alive || seat === this.me.seat || seat === this.lord.seat) return false;
    if (p.role !== null) return p.role === 'rebel';
    const pool = this.unknownRoles();
    if (pool.size === 1) return pool.has('rebel');
    const pair = this.loyalRebelPair();
    if (pair) return pair.rebel === seat;
    return this.looksRebel(seat);
  }

  private likelyLoyal(seat: number): boolean {
    const p = this.view.players[seat];
    if (!p.alive || seat === this.me.seat || seat === this.lord.seat) return false;
    if (p.role !== null) return p.role === 'loyalist';
    const pair = this.loyalRebelPair();
    if (pair) return pair.loyalist === seat;
    return this.looksLoyal(seat);
  }

  /**
   * 内奸视角：只剩两个未知者且必定一忠一反时，比较两人谁更像忠臣
   * （倾向分高者为忠；分数相同时，打主公更多的是反贼）。看不出差别时返回 null。
   */
  private loyalRebelPair(): { loyalist: number; rebel: number } | null {
    const unknown = this.aliveOthers().filter((x) => x.role === null && x.seat !== this.lord.seat);
    const pool = this.unknownRoles();
    if (unknown.length !== 2 || pool.size !== 2 || !pool.has('loyalist') || !pool.has('rebel')) return null;
    const lord = this.lord.seat;
    const score = (s: number) => this.lean(s) - (this.view.hostility[s]?.[lord] ?? 0) + (this.view.help[s]?.[lord] ?? 0);
    const [a, b] = unknown.map((x) => x.seat);
    const d = score(a) - score(b);
    if (Math.abs(d) < 1e-6) return null;
    return d > 0 ? { loyalist: a, rebel: b } : { loyalist: b, rebel: a };
  }

  /** 抢人头是否安全：杀掉这个反贼后不会落入主公 + 忠臣 2 打 1 */
  private canStealKill(): boolean {
    if (!RENEGADE_TUNING.stealKills) return false;
    const { rebels, loyalists, loyalistAlive } = this.aliveCounts();
    if (RENEGADE_TUNING.stealLastRebel) return true;
    // 杀掉这个反贼后，忠臣不能比反贼多
    if (this.wideBalance()) return rebels - 1 >= loyalists;
    return !(rebels === 1 && loyalistAlive);
  }

  /** 【隐忍】免伤中的角色不当作攻击目标 */
  private isEnemy = (seat: number) => !this.view.players[seat].shielded && this.relation(seat) === 'enemy';
  private isFriend = (seat: number) => this.relation(seat) === 'friend';

  /** 优先攻击体力最低的目标（简单：随便挑一个） */
  private weakest(seats: number[]): number | undefined {
    if (this.level === 'easy') {
      if (seats.length === 0) return undefined;
      return seats[hash(`${this.view.turn}|${this.me.seat}|${this.hand.length}|${seats.join(',')}`) % seats.length];
    }
    // 反贼集火主公（2v2 要打死两人，按体力挑）
    if (this.me.role === 'rebel' && !this.versus && seats.includes(this.lord.seat)) return this.lord.seat;
    return [...seats].sort((a, b) => this.view.players[a].hp - this.view.players[b].hp)[0];
  }

  // ───────────── 卡牌价值 ─────────────

  value(card: Card): number {
    const def = cardDef(card.key);
    if (def.kind === 'equip') return this.me.equips[def.slot!] ? 1 : 3.5;
    switch (card.key) {
      case 'yao':
        return 7;
      case 'bi':
        return 5.5;
      case 'tiaobing':
        return 5;
      case 'tianlei':
        return 1.5;
      case 'shipo':
        return 4.5;
      case 'zhan':
        return this.hand.filter((c) => c.key === 'zhan').length > 1 ? 2.5 : 4;
      default:
        return 3;
    }
  }

  private best(cards: Card[], n: number): Card[] {
    return [...cards].sort((a, b) => this.value(b) - this.value(a)).slice(0, n);
  }

  private cheapest(cards: Card[], n: number): Card[] {
    return [...cards].sort((a, b) => this.value(a) - this.value(b)).slice(0, n);
  }

  // ───────────── 出牌阶段 ─────────────

  private play(options: PlayOption[], skills: SkillOption[]): PlayAction {
    const byKey = (key: string) => options.filter((o) => this.card(o.cardId)?.key === key);
    const use = (o: PlayOption, target?: number, extraTarget?: number): PlayAction => ({
      type: 'use',
      cardId: o.cardId,
      ...(target !== undefined ? { target } : {}),
      ...(extraTarget !== undefined ? { extraTarget } : {}),
    });

    // 1. 装备：空槽直接装，武器射程更远才替换
    for (const o of options) {
      const card = this.card(o.cardId)!;
      const def = cardDef(card.key);
      if (def.kind !== 'equip') continue;
      const current = this.me.equips[def.slot!];
      if (def.slot === 'weapon') {
        if (this.weaponScore(card.key) > (current ? this.weaponScore(current.key) : 0)) return use(o);
        continue;
      }
      if (!current) return use(o);
    }

    // 2. 回复
    const yao = byKey('yao')[0];
    if (yao && (this.me.hp <= 1 || this.hand.length > this.me.hp)) return use(yao);

    // 内奸抢人头：补刀体力 ≤1 的反贼，拿 3 张奖励牌
    if (this.me.role === 'renegade' && this.canStealKill()) {
      const prey = (t: number) => this.view.players[t].hp <= 1 && this.likelyRebel(t);
      const z = byKey('zhan').find((o) => o.targets.some(prey));
      if (z) return use(z, z.targets.find(prey));
      const hasZhan = this.hand.some((c) => c.key === 'zhan');
      const bw = hasZhan ? byKey('biwu').find((o) => o.targets.some(prey)) : undefined;
      if (bw) return use(bw, bw.targets.find(prey));
    }

    // 3. 增益锦囊
    const tb = byKey('tiaobing')[0];
    if (tb) return use(tb);
    const xz = byKey('xiuzheng')[0];
    if (xz && this.me.hp < this.me.maxHp) return use(xz);

    // 4. 主动技能
    for (const s of skills) {
      const action = this.skill(s);
      if (action) return action;
    }

    // 5. 攻击锦囊
    for (const key of ['jieying', 'cefan', 'biwu']) {
      for (const o of byKey(key)) {
        let targets = o.targets.filter(this.isEnemy);
        if (key === 'biwu' && this.hand.filter((c) => c.key === 'zhan').length === 0) targets = [];
        const t = this.weakest(targets);
        if (t !== undefined) return use(o, t);
      }
    }
    // 延时锦囊：军令给手牌多（多半有【斩】）、威胁大的敌人；断粮给体力高、手牌少的敌人
    for (const o of byKey('junling')) {
      const t = this.mostBy(o.targets.filter(this.isEnemy), (s) => this.threat(s));
      if (t !== undefined) return use(o, t);
    }
    for (const o of byKey('duanliang')) {
      const t = this.mostBy(o.targets.filter(this.isEnemy), (s) => this.view.players[s].hp - this.view.players[s].handCount / 2);
      if (t !== undefined) return use(o, t);
    }
    const tl = byKey('tianlei')[0];
    if (tl && this.wantTianlei()) return use(tl);
    const xw = byKey('xiwen')[0];
    if (xw) {
      const others = this.aliveOthers();
      const enemies = others.filter((p) => this.isEnemy(p.seat)).length;
      const friends = others.filter((p) => this.isFriend(p.seat)).length;
      if (enemies > 0 && enemies >= friends) return use(xw);
    }

    // 6. 【斩】
    for (const o of byKey('zhan')) {
      const t = this.weakest(o.targets.filter(this.isEnemy));
      if (t === undefined) continue;
      const extra = this.weakest((o.extraTargets?.[t] ?? []).filter(this.isEnemy));
      return use(o, t, extra);
    }

    return { type: 'end' };
  }

  private skill(s: SkillOption): PlayAction | null {
    switch (s.skill) {
      case 'yinrenDraw': {
        const x = this.me.damageTaken ?? 0;
        return RENEGADE_TUNING.yinrenActive === 'all' && x >= RENEGADE_TUNING.yinrenDrawAt ? { type: 'skill', skill: s.skill, cards: [], targets: [] } : null;
      }
      case 'yinrenHit': {
        if (RENEGADE_TUNING.yinrenActive === 'never') return null;
        // 能直接打进濒死且不会自救的敌人；打反贼时要保证不落入被主公方围攻
        const lethal = (t: number) => {
          const p = this.view.players[t];
          const mirror = p.equips.armor?.key === 'huxinjing' && p.hp <= 2 ? 1 : 0;
          return p.hp + mirror <= YINREN_DAMAGE && this.isEnemy(t) && (!this.likelyRebel(t) || this.canStealKill());
        };
        const t = this.weakest(s.targets.filter(lethal));
        return t === undefined ? null : { type: 'skill', skill: s.skill, cards: [], targets: [t] };
      }
      case 'kuanren': {
        const t = this.weakest(s.targets.filter(this.isFriend));
        if (t === undefined) return null;
        const cards = this.cheapest(this.hand.filter((c) => c.key !== 'yao'), 1);
        if (cards.length < 1) return null;
        return { type: 'skill', skill: s.skill, cards: cards.map((c) => c.id), targets: [t] };
      }
      case 'huoji': {
        const t = this.weakest(s.targets.filter(this.isEnemy));
        if (t === undefined) return null;
        const pair = this.cheapestSameSuitPair();
        if (!pair) return null;
        return { type: 'skill', skill: s.skill, cards: pair.map((c) => c.id), targets: [t] };
      }
      case 'huoxin': {
        // 让非队友去打敌人：要么敌人掉血，要么我拿到牌
        for (const a of s.targets.filter((x) => !this.isFriend(x))) {
          const b = this.weakest((s.secondTargets?.[a] ?? []).filter(this.isEnemy));
          if (b !== undefined) return { type: 'skill', skill: s.skill, cards: [], targets: [a, b] };
        }
        return null;
      }
      case 'baodao': {
        // 先用真【斩】打攻击范围内的敌人；用多余的装备牌打够不着的敌人
        const t = this.weakest(s.targets.filter(this.isEnemy));
        if (t === undefined) return null;
        // 手牌里多余的装备（同槽已有装备）比【斩】便宜，优先用它
        const spare = this.hand.filter((c) => cardDef(c.key).kind === 'equip' && this.me.equips[cardDef(c.key).slot!]);
        const zhanReach = this.hand.some((c) => c.key === 'zhan') && this.aliveOthers().some((p) => this.isEnemy(p.seat) && this.inRange(p.seat));
        let card = this.cheapest(spare, 1)[0];
        if (!card && !zhanReach) card = this.cheapest(this.hand.filter((c) => cardDef(c.key).kind === 'equip'), 1)[0];
        if (!card) return null;
        return { type: 'skill', skill: s.skill, cards: [card.id], targets: [t] };
      }
      case 'lianmeng': {
        // 交给队友（手牌最少者优先）一张不值钱的牌，然后自己摸一张
        const friends = s.targets.filter(this.isFriend);
        if (friends.length === 0) return null;
        const t = [...friends].sort((a, b) => this.view.players[a].handCount - this.view.players[b].handCount)[0];
        const card = this.cheapest(this.hand, 1)[0];
        return { type: 'skill', skill: s.skill, cards: [card.id], targets: [t] };
      }
      case 'duoxie': {
        // 抢距离 1 以内敌人的装备（对方摸一张，相当于用 1 张手牌换走 1 件装备）
        const order: string[] = [...EQUIP_STEAL_ORDER];
        const rank = (t: number) => {
          const slots = Object.keys(this.view.players[t].equips).map((k) => order.indexOf(k)).filter((i) => i >= 0);
          return slots.length ? -Math.min(...slots) : -99;
        };
        const t = this.mostBy(s.targets.filter(this.isEnemy), rank);
        return t === undefined ? null : { type: 'skill', skill: s.skill, cards: [], targets: [t] };
      }
      case 'fencheng':
        return this.fenchengWorth() ? { type: 'skill', skill: s.skill, cards: [], targets: [] } : null;
      case 'qixi':
        return { type: 'skill', skill: s.skill, cards: [], targets: [] };
      case 'fushang': {
        // 给体力最低的队友（主公优先）两张不值钱的牌；自己手牌太少时不送【药】
        const friends = s.targets.filter(this.isFriend);
        const t = friends.includes(this.lord.seat) ? this.lord.seat : this.weakest(friends);
        if (t === undefined) return null;
        const cards = this.cheapest(this.hand.filter((c) => c.key !== 'yao'), s.cardCount);
        if (cards.length < s.cardCount) return null;
        return { type: 'skill', skill: s.skill, cards: cards.map((c) => c.id), targets: [t] };
      }
      case 'jikun': {
        // 自己不缺血（或体力不低）时，把【药】用在体力最低的队友身上，然后摸两张
        if (this.me.hp <= 1) return null;
        const friends = s.targets.filter(this.isFriend);
        const t = friends.includes(this.lord.seat) ? this.lord.seat : this.weakest(friends);
        const yao = this.hand.find((c) => c.key === 'yao');
        if (t === undefined || !yao) return null;
        return { type: 'skill', skill: s.skill, cards: [yao.id], targets: [t] };
      }
      case 'bohu': {
        // 手里有【斩】能打到敌人时，输了会失去这次【斩】，要求更高的胜算
        const zhanReach = this.hand.some((c) => c.key === 'zhan') && this.aliveOthers().some((p) => this.isEnemy(p.seat) && this.inRange(p.seat));
        const t = this.pindianTarget(s.targets, zhanReach ? 0.65 : 0.45);
        return t === undefined ? null : { type: 'skill', skill: s.skill, cards: [], targets: [t] };
      }
      case 'qimou':
      case 'laojiang': {
        const t = this.pindianTarget(s.targets, 0.45);
        return t === undefined ? null : { type: 'skill', skill: s.skill, cards: [], targets: [t] };
      }
      case 'luance': {
        const pair = this.luancePair(s);
        const pay = this.cheapest(this.hand.filter((c) => c.key !== 'yao'), s.cardCount);
        if (!pair || pay.length < s.cardCount || pay.some((c) => this.value(c) > PINDIAN_AI.luancePayLimit)) return null;
        return { type: 'skill', skill: s.skill, cards: pay.map((c) => c.id), targets: pair };
      }
      case 'dujiang': {
        // 用不值钱的 ♦ 牌给体力高、手牌少的敌人上【断粮】
        const card = this.cheapest(this.hand.filter((c) => c.suit === 'diamond'), 1)[0];
        if (!card || this.value(card) > 4) return null;
        const t = this.mostBy(s.targets.filter(this.isEnemy), (x) => this.view.players[x].hp - this.view.players[x].handCount / 2);
        return t === undefined ? null : { type: 'skill', skill: s.skill, cards: [card.id], targets: [t] };
      }
    }
  }

  // ───────────── 拼点 ─────────────

  /** 拼点牌点数（程普【老将】+2，武将公开） */
  private pindianRank(seat: number, card: Card): number {
    return this.view.players[seat].general === 'chengpu' ? Math.min(13, card.rank + PINDIAN_AI.laojiangBonus) : card.rank;
  }

  /** 拼点愿意花掉的牌：不拿【药】和较值钱的牌去拼 */
  private pindianFodder(limit = PINDIAN_AI.valueLimit): Card[] {
    return this.hand.filter((c) => this.value(c) <= limit);
  }

  /** 主动拼点时打算出的牌：点数最大（相同时更便宜）的可花费手牌 */
  private pindianBest(seat = this.me.seat, cards = this.pindianFodder()): Card | undefined {
    return [...cards].sort((a, b) => this.pindianRank(seat, b) - this.pindianRank(seat, a) || this.value(a) - this.value(b))[0];
  }

  /**
   * 粗略估计我出点数 r（已含加成）拼赢 opp 的概率（我是发起者，须严格大于）：
   * 对方大约从 min(手牌数, 3) 张牌中挑最大的一张。
   */
  private pindianWinChance(r: number, opp: number): number {
    const k = Math.min(this.view.players[opp].handCount, PINDIAN_AI.oppPicks);
    const bonus = this.view.players[opp].general === 'chengpu' ? PINDIAN_AI.laojiangBonus : 0;
    const beat = Math.max(0, Math.min(13, r - 1 - bonus)) / 13; // 对方单张点数 < r 的概率
    return beat ** Math.max(1, k);
  }

  /** 挑一名敌人拼点：胜算不低于 min 时，胜算最高（相同时体力最低）的那个 */
  private pindianTarget(targets: number[], min: number): number | undefined {
    const card = this.pindianBest();
    if (!card) return undefined;
    const r = this.pindianRank(this.me.seat, card);
    const ok = targets.filter((t) => this.isEnemy(t) && this.pindianWinChance(r, t) >= min);
    return this.mostBy(ok, (t) => this.pindianWinChance(r, t) * 10 - this.view.players[t].hp);
  }

  /** 拼点时选牌 */
  private pindianCard(cards: Card[], info: PindianInfo): Card {
    let wantWin: boolean;
    if (info.skill === 'luance') wantWin = !this.isFriend(info.opponent);
    else wantWin = info.initiator || !this.isFriend(info.opponent);
    if (!wantWin) return this.cheapest(cards, 1)[0];
    // 被【搏虎】要挨打、被【乱策】要挨【斩】时更舍得出好牌
    const hurts = info.skill === 'bohu' || info.skill === 'luance';
    const pool = cards.filter((c) => this.value(c) <= (hurts && !info.initiator ? PINDIAN_AI.defendLimit : PINDIAN_AI.valueLimit));
    return this.pindianBest(this.me.seat, pool.length > 0 ? pool : cards) ?? this.cheapest(cards, 1)[0];
  }

  /**
   * 乱策：两名敌人互拼（谁输都有敌人挨【斩】）；
   * 普通难度下，也可以让手牌明显更多的队友去拼敌人（敌人当发起者，平局也算队友赢）。
   */
  private luancePair(s: SkillOption): [number, number] | null {
    const enemies = s.targets.filter(this.isEnemy);
    if (enemies.length >= 2) {
      const a = this.weakest(enemies)!;
      const b = this.weakest(enemies.filter((x) => x !== a))!;
      return [a, b];
    }
    if (this.level === 'easy' || enemies.length === 0) return null;
    const e = enemies[0];
    const friends = s.targets.filter((f) => this.isFriend(f) && this.view.players[f].handCount >= this.view.players[e].handCount + PINDIAN_AI.luanceFriendLead);
    const f = this.mostBy(friends, (x) => this.view.players[x].handCount);
    return f === undefined ? null : [e, f];
  }

  /**
   * 定策：这次判定希望得到什么结果。返回判定牌 → 是否符合我的期望；null 表示无所谓。
   * 延时锦囊：敌人中招好、队友中招坏；奇袭：队友希望黑色（打人），敌人希望红色（只摸牌）。
   */
  private judgeWish(j: JudgeInfo): ((c: Card) => boolean) | null {
    const rel = this.relation(j.seat);
    if (rel === 'neutral') return null;
    const friend = rel === 'friend';
    if (j.what === 'qixi') return (c) => isRed(c) !== friend;
    // 兽面盾：红色才挡住，队友希望红色
    if (j.what === 'shoumiandun') return (c) => isRed(c) === friend;
    if (j.what === 'tianlei') return (c) => tianleiHit(c) === !friend;
    const effective = j.what === 'duanliang' ? (c: Card) => c.suit !== 'club' : (c: Card) => !isRed(c);
    return (c) => effective(c) === !friend;
  }

  private dingce(j: JudgeInfo): string {
    const wish = this.judgeWish(j);
    if (!wish || wish(j.result)) return 'no';
    const card = this.cheapest(this.hand.filter(wish), 1)[0];
    // 不为改判舍弃【药】
    return card && card.key !== 'yao' ? String(card.id) : 'no';
  }

  /**
   * 放【天雷】：先劈自己，所以体力要扛得住（劈完不进濒死）；
   * 我方体力落后（或持平）时放出来搏一把，反贼 / 内奸更愿意放。
   */
  wantTianlei(): boolean {
    if (this.me.hp <= TIANLEI_DAMAGE) return false;
    if (this.me.role === 'renegade') return true;
    let mine = 0;
    let theirs = 0;
    for (const p of this.view.players) {
      if (!p.alive) continue;
      if (p.seat === this.me.seat || this.isFriend(p.seat)) mine += p.hp;
      else if (this.isEnemy(p.seat)) theirs += p.hp;
    }
    const bias = this.me.role === 'rebel' ? 2 : 0;
    return mine <= theirs + bias;
  }

  /** 流星锤：目标是敌人时，弃最不值钱的一张（不弃【药】【避】） */
  private liuxing(target: number): string {
    if (!this.isEnemy(target)) return 'no';
    const c = this.cheapest(this.hand, 1)[0];
    return c && this.value(c) <= 4 ? String(c.id) : 'no';
  }

  /** 分数最高的座位（反贼仍优先针对主公） */
  private mostBy(seats: number[], score: (s: number) => number): number | undefined {
    if (this.me.role === 'rebel' && seats.includes(this.lord.seat)) return this.lord.seat;
    return [...seats].sort((a, b) => score(b) - score(a))[0];
  }

  /** 进攻威胁（只用公开信息）：手牌数 + 武器射程 + 多【斩】类武将 */
  private threat(seat: number): number {
    const p = this.view.players[seat];
    const w = p.equips.weapon;
    const multi = ['zhaoyun', 'zhangliao', 'huangzhong', 'lvbu'].includes(p.general) ? 1.5 : 0;
    return p.handCount + (w ? (cardDef(w.key).range ?? 1) - 1 : 0) + multi;
  }

  /** 是否在攻击范围内（只看武器与坐骑，公开信息） */
  private inRange(seat: number): boolean {
    if (this.me.general === 'huangzhong') return true; // 宝刀
    const w = this.me.equips.weapon;
    const range = (w ? cardDef(w.key).range ?? 1 : 1) + (this.me.general === 'lvbu' ? 1 : 0);
    return seatDistance(this.view.players, this.me.seat, seat) <= range;
  }

  /** 焚城的收益：打到敌人加分（能打死加更多），打到队友扣分；自己要失去 1 点体力 */
  private fenchengWorth(): boolean {
    if (this.me.hp < 2) return false;
    let score = 0;
    for (const p of this.aliveOthers()) {
      const rel = this.relation(p.seat);
      const lethal = p.hp <= 1;
      if (rel === 'enemy') score += lethal ? 3 : 1;
      else if (rel === 'friend') score -= lethal ? 5 : 1.5;
      // 内奸不能让主公被打死
      if (this.me.role === 'renegade' && p.seat === this.lord.seat && lethal && this.aliveOthers().length > 1) return false;
    }
    return score >= FENCHENG_MIN_SCORE;
  }

  /** 舍身：替队友挡伤害；自己体力充足，或队友会因此死亡 */
  private sheshen(target: number, amount: number): boolean {
    if (!this.isFriend(target)) return false;
    const t = this.view.players[target];
    if (this.me.hp <= amount) return false;
    return this.me.hp - amount >= 2 || t.hp <= amount;
  }

  /** 武器评分：射程越远越好；神臂弓在敌人都贴身时毫无用处 */
  weaponScore(key: string): number {
    const range = cardDef(key).range ?? 1;
    if (key !== 'shenbigong') return range;
    const others = this.aliveOthers();
    // 只剩 3 人及以下时所有人距离都为 1，神臂弓无法出【斩】
    return others.length <= 2 ? -1 : range - 1.5;
  }

  private cheapestSameSuitPair(): Card[] | null {
    const groups = new Map<string, Card[]>();
    for (const c of this.hand) groups.set(c.suit, [...(groups.get(c.suit) ?? []), c]);
    let best: Card[] | null = null;
    let bestCost = Infinity;
    for (const g of groups.values()) {
      if (g.length < 2) continue;
      const pair = this.cheapest(g, 2);
      const cost = this.value(pair[0]) + this.value(pair[1]);
      if (cost < bestCost) [best, bestCost] = [pair, cost];
    }
    return best;
  }

  private card(id: number): Card | undefined {
    return this.hand.find((c) => c.id === id);
  }

  // ───────────── 响应 ─────────────

  private respond(accept: string[], reason: RespondReason, allowPair: boolean, equipDodge: Card[] = []): number | [number, number] | null {
    const usable = this.cheapest(this.hand.filter((c) => accept.includes(c.key)), this.hand.length);
    const first = usable[0]?.id ?? null;

    switch (reason.kind) {
      case 'dodge': {
        // 死战：手里有同类备用装备时，先用装备区的那件（换上备用的），留着【避】
        if (equipDodge.length > 0) {
          const spare = equipDodge.find((e) => this.hand.some((c) => cardDef(c.key).kind === 'equip' && cardDef(c.key).slot === cardDef(e.key).slot));
          if (spare) return spare.id;
        }
        if (first !== null) return first;
        // 死战：没有【避】时用装备区最不重要的牌（与拆装备的优先顺序相反）
        if (equipDodge.length > 0) {
          const order: string[] = [...EQUIP_STEAL_ORDER];
          return [...equipDodge].sort((a, b) => order.indexOf(cardDef(b.key).slot!) - order.indexOf(cardDef(a.key).slot!))[0].id;
        }
        if (!allowPair) return null;
        const red = this.cheapest(this.hand.filter(isRed), 2);
        const black = this.cheapest(this.hand.filter((c) => !isRed(c)), 2);
        const pair = [red, black].filter((p) => p.length === 2).sort((a, b) => this.pairCost(a) - this.pairCost(b))[0];
        return pair ? [pair[0].id, pair[1].id] : null;
      }
      case 'haoling':
        return this.isFriend(reason.lord) ? first : null;
      case 'save':
        return this.shouldSave(reason.dying) ? first : null;
      case 'shipo': {
        if (this.level === 'easy') return null; // 简单：不用【识破】
        const harmful = HARMFUL_TRICKS.has(reason.trick);
        // 原锦囊对目标的效果是否对我有利
        const goodForMe = harmful ? this.isEnemy(reason.target) : this.isFriend(reason.target);
        const badForMe = harmful ? this.isFriend(reason.target) : this.isEnemy(reason.target);
        // countering=false：要不要阻止原效果；countering=true：要不要让原效果恢复
        // 天雷：只在自己或队友会被劈进濒死时挡（挡掉也只是传给下家）
        if (reason.trick === 'tianlei' && !reason.countering) {
          const t = this.view.players[reason.target];
          return (reason.target === this.me.seat || this.isFriend(reason.target)) && t.hp <= TIANLEI_DAMAGE ? first : null;
        }
        if (!reason.countering) return badForMe && harmful ? first : null;
        return goodForMe ? first : null;
      }
      case 'xiwen':
      case 'yulin': {
        // 用最不值钱的基础牌抵挡；只剩【药】时体力充足就硬吃
        const basic = usable.filter((c) => BASIC_KEYS.includes(c.key));
        const c = basic[0];
        if (!c) return null;
        if (c.key === 'yao' && this.me.hp >= 3) return null;
        return c.id;
      }
      case 'biwu':
        return first;
      case 'huoxin':
        return this.isFriend(reason.victim) ? null : first;
    }
  }

  private pairCost(pair: Card[]): number {
    return pair.reduce((s, c) => s + this.value(c), 0);
  }

  private shouldSave(dying: number): boolean {
    if (dying === this.me.seat) return true;
    // 简单：只救自己和（非敌对的）主公
    if (this.level === 'easy') return dying === this.lord.seat && this.me.role !== 'rebel' && this.aliveOthers().length > 1;
    // 内奸需要主公撑到最后，但最后单挑时不救
    if (this.me.role === 'renegade' && dying === this.lord.seat) return this.aliveOthers().length > 1;
    // 平衡模式：保住最后一个反贼
    if (this.me.role === 'renegade' && RENEGADE_TUNING.saveLastRebel && this.renegadeMode() === 'balance' && this.likelyRebel(dying))
      return true;
    return this.isFriend(dying);
  }

  // ───────────── 其他选择 ─────────────

  private pickFrom(target: number, equips: Card[], handCount: number): CardPick {
    if (this.isFriend(target) && handCount > 0) return { zone: 'hand' };
    const targetEquips = this.view.players[target].equips;
    for (const slot of EQUIP_STEAL_ORDER) {
      const c = targetEquips[slot];
      if (c && equips.some((e) => e.id === c.id)) return { zone: 'equip', cardId: c.id };
    }
    return handCount > 0 || equips.length === 0 ? { zone: 'hand' } : { zone: 'equip', cardId: equips[0].id };
  }

  private bestEquipToRemove(cards: Card[]): Card {
    const order: string[] = [...EQUIP_STEAL_ORDER];
    return [...cards].sort((a, b) => order.indexOf(cardDef(a.key).slot!) - order.indexOf(cardDef(b.key).slot!))[0];
  }

  private chooseGeneral(options: string[]): string {
    const rank = (g: string) => {
      const r = this.me.role === 'renegade' ? RENEGADE_PREFERENCE.indexOf(g) : -1;
      if (r >= 0) return r - 100;
      // 偏好表排名 + 确定性扰动（0 ~ PICK_JITTER），让排名相近的武将都有机会被选，排最后的也不会永远落选
      return GENERAL_PREFERENCE.indexOf(g) + (hash(`${this.me.seat}|${options.join(',')}|${g}`) % 1000) / 1000 * PICK_JITTER;
    };
    return [...options].sort((a, b) => rank(a) - rank(b))[0];
  }

  /** 拔矢：只反击敌人；弃最不值钱的牌，不弃【药】；对方会因此濒死时总是发动 */
  private bashi(source: number, options: ChoiceOption[]): string {
    if (!this.isEnemy(source)) return 'no';
    const c = this.cheapest(this.hand.filter((x) => x.key !== 'yao'), 1)[0];
    return c && options.some((o) => o.id === String(c.id)) ? String(c.id) : 'no';
  }

  /** 清音：和用【药】救人的判断一致；弃最不值钱的非【药】牌（有【药】时直接用【药】救更划算） */
  private qingyin(dying: number, options: ChoiceOption[]): string {
    if (!this.shouldSave(dying)) return 'no';
    const c = this.cheapest(this.hand.filter((x) => x.key !== 'yao'), 1)[0];
    return c && options.some((o) => o.id === String(c.id)) ? String(c.id) : 'no';
  }

  private choose(reason: ChooseReason, options: ChoiceOption[]): string {
    if (reason === 'xiuzheng') return this.me.hp < this.me.maxHp ? 'recover' : 'draw';
    if (reason === 'jinfan' || reason === 'bushi' || reason === 'yinren') return 'yes';
    if (reason === 'qixi') {
      const t = this.weakest(options.filter((o) => o.id !== 'no').map((o) => Number(o.id)).filter(this.isEnemy));
      return t === undefined ? 'no' : String(t);
    }
    if (reason === 'yangsheng') {
      // 弃最不值钱的手牌回血
      const c = this.cheapest(this.hand, 1)[0];
      return c && options.some((o) => o.id === String(c.id)) ? String(c.id) : 'no';
    }
    // 先登：有【斩】、没有神臂弓、有敌人，且敌人都够不着或手里有 2 张以上【斩】时发动
    const hasZhan = this.hand.some((c) => c.key === 'zhan');
    const shenbi = this.me.equips.weapon?.key === 'shenbigong';
    const range = this.me.equips.weapon ? cardDef(this.me.equips.weapon.key).range ?? 1 : 1;
    const enemies = this.aliveOthers().filter((p) => this.isEnemy(p.seat));
    const inRange = (s: number) => seatDistance(this.view.players, this.me.seat, s) <= range;
    const worth = !enemies.some((p) => inRange(p.seat)) || this.hand.filter((c) => c.key === 'zhan').length >= 2;
    return hasZhan && !shenbi && enemies.length > 0 && worth && options.some((o) => o.id === 'yes') ? 'yes' : 'no';
  }
}
