import { BASIC_KEYS, cardDef, isRed } from '../data/cards';
import type {
  Card,
  CardPick,
  ChoiceOption,
  ChooseReason,
  Controller,
  GameView,
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

type Relation = 'friend' | 'enemy' | 'neutral';

/** 选将偏好：越靠前越优先 */
const GENERAL_PREFERENCE = [
  'zhugeliang', 'guojia', 'caocao', 'liubei', 'zhaoyun', 'sunquan', 'ganning', 'lvbu', 'zhouyu', 'huatuo',
  'luxun', 'zhangjiao', 'guanyu', 'simayi', 'diaochan', 'zhangliao',
];
/** 内奸要活到最后：按模拟中内奸胜率排序（关羽、刘备、司马懿明显更高） */
const RENEGADE_PREFERENCE = ['guanyu', 'liubei', 'simayi', 'zhaoyun', 'huatuo'];

/** 内奸帮反贼期间，主公体力降到此值及以下时转回帮主公 */
export const LORD_DANGER_HP = 4;

/** 身份倾向分超过此值才认定敌友（+1 确定忠，−1 确定反） */
export const LEAN_THRESHOLD = 0.4;
/** 连锁推理的迭代轮数 */
const LEAN_ITERATIONS = 8;

const HARMFUL_TRICKS = new Set(['jieying', 'cefan', 'xiwen', 'biwu']);
const EQUIP_STEAL_ORDER = ['armor', 'weapon', 'horsePlus', 'horseMinus'] as const;

export class BasicAI implements Controller {
  async decide<R extends Request>(view: GameView, req: R): Promise<Response<R>> {
    return new Brain(view).decide(req) as Response<R>;
  }
}

/** 针对单次决策的分析器 */
class Brain {
  readonly me: PlayerPublic;
  readonly hand: Card[];
  readonly lord: PlayerPublic;

  private leanCache: number[] | null = null;

  constructor(readonly view: GameView) {
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
        return this.respond(req.accept, req.reason, !!req.allowPair);
      case 'discard':
        return this.cheapest(this.hand, req.count).map((c) => c.id);
      case 'chooseCard':
        return this.pickFrom(req.target, req.equips, req.handCount);
      case 'choose':
        return this.choose(req.reason, req.options);
      case 'selectCards':
        if (req.reason === 'huoxin') return this.cheapest(req.cards, req.count).map((c) => c.id);
        if (req.reason === 'xiaoyong') return [this.bestEquipToRemove(req.cards).id];
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
   * 总身份 = 1 主公 + 1 忠臣 + 2 反贼 + 1 内奸，去掉已知身份（自己、主公、阵亡者）后剩下的就是未知者的候选。
   */
  private unknownRoles(): Set<string> {
    const pool = ['loyalist', 'rebel', 'rebel', 'renegade'];
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

  relation(seat: number): Relation {
    if (seat === this.me.seat) return 'friend';
    const known = this.view.players[seat].role;
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
      case 'lord':
      case 'loyalist':
        if (seat === lord) return 'friend';
        if (this.looksRebel(seat)) return 'enemy';
        if (this.looksLoyal(seat)) return 'friend';
        return attacksMe ? 'enemy' : 'neutral';
      case 'rebel':
        if (seat === lord) return 'enemy';
        if (this.looksLoyal(seat)) return 'enemy';
        if (this.looksRebel(seat)) return 'friend';
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
  private renegadeMode(): 'wait' | 'lord' | 'rebels' {
    const first = this.view.deathOrder[0];
    if (first === undefined) return 'wait';
    if (this.view.players[first].role !== 'rebel') return 'lord';
    // 动态切换：反贼人数不再少于主公方时（如忠臣也阵亡了），转回帮主公
    const dead = (role: string) => this.view.players.filter((p) => !p.alive && p.role === role).length;
    const rebels = 2 - dead('rebel');
    const lordSide = 1 + (1 - dead('loyalist'));
    return rebels >= lordSide || this.lord.hp <= LORD_DANGER_HP ? 'lord' : 'rebels';
  }

  private isEnemy = (seat: number) => this.relation(seat) === 'enemy';
  private isFriend = (seat: number) => this.relation(seat) === 'friend';

  /** 优先攻击体力最低的目标 */
  private weakest(seats: number[]): number | undefined {
    // 反贼集火主公
    if (this.me.role === 'rebel' && seats.includes(this.lord.seat)) return this.lord.seat;
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
      case 'kuanren': {
        const t = this.weakest(s.targets.filter(this.isFriend));
        if (t === undefined) return null;
        const cards = this.cheapest(this.hand.filter((c) => c.key !== 'yao'), 2);
        if (cards.length < 2) return null;
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
    }
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

  private respond(accept: string[], reason: RespondReason, allowPair: boolean): number | [number, number] | null {
    const usable = this.cheapest(this.hand.filter((c) => accept.includes(c.key)), this.hand.length);
    const first = usable[0]?.id ?? null;

    switch (reason.kind) {
      case 'dodge': {
        if (first !== null) return first;
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
        const harmful = HARMFUL_TRICKS.has(reason.trick);
        // 原锦囊对目标的效果是否对我有利
        const goodForMe = harmful ? this.isEnemy(reason.target) : this.isFriend(reason.target);
        const badForMe = harmful ? this.isFriend(reason.target) : this.isEnemy(reason.target);
        // countering=false：要不要阻止原效果；countering=true：要不要让原效果恢复
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
    // 内奸需要主公撑到最后，但最后单挑时不救
    if (this.me.role === 'renegade' && dying === this.lord.seat) return this.aliveOthers().length > 1;
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
      return r >= 0 ? r - 100 : GENERAL_PREFERENCE.indexOf(g);
    };
    return [...options].sort((a, b) => rank(a) - rank(b))[0];
  }

  private choose(reason: ChooseReason, options: ChoiceOption[]): string {
    if (reason === 'xiuzheng') return this.me.hp < this.me.maxHp ? 'recover' : 'draw';
    if (reason === 'jinfan') return 'yes';
    if (reason === 'yangsheng') {
      // 弃最不值钱的手牌回血
      const c = this.cheapest(this.hand, 1)[0];
      return c && options.some((o) => o.id === String(c.id)) ? String(c.id) : 'no';
    }
    // 先登：有【斩】、没有神臂弓、且有够不着的敌人时发动
    const hasZhan = this.hand.some((c) => c.key === 'zhan');
    const shenbi = this.me.equips.weapon?.key === 'shenbigong';
    const farEnemy = this.aliveOthers().some((p) => this.isEnemy(p.seat));
    return hasZhan && !shenbi && farEnemy && options.some((o) => o.id === 'yes') ? 'yes' : 'no';
  }
}
