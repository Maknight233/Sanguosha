/**
 * 新手教学局：一局发牌和电脑行动都写死的 5 人局，玩家当主公，按提示一步步操作。
 * 剧本是一串「节拍」（Beat）：轮到某个座位回答某类请求时，先显示讲解，再由电脑按剧本行动、或等玩家做出指定操作。
 * 教学局不保存记录、不计入战绩；武将技能关闭，保证每一步都和剧本一致。
 */
import { cardDef } from '../data/cards';
import { Game } from '../engine/game';
import type { Card, Controller, GameView, Request, Response, Role, Winner } from '../engine/types';
import { HumanController, PacedController, type PauseGate } from './controllers';

export const TUTORIAL_NAMES = ['你', '电脑一', '电脑二', '电脑三', '电脑四'];
export const TUTORIAL_ROLES: Role[] = ['lord', 'rebel', 'loyalist', 'rebel', 'renegade'];
/** 0 号位（玩家）和 1 号位用 3 体力的武将：主公 +1 后是 4 体力，正好演示弃牌；1 号位两回合内可以击杀 */
export const TUTORIAL_GENERALS = ['guojia', 'diaochan', 'zhangliao', 'lvbu', 'simayi'];

/** 起始手牌（按座位） */
const HANDS: string[][] = [
  ['zhan', 'huanshoudao', 'tiaobing', 'bi'],
  ['zhan', 'zhan', 'tiaobing', 'biwu'],
  ['zhan', 'zhan', 'bi', 'jieying'],
  ['tiejiqiang', 'jieying', 'zhan', 'biwu'], // 留一张能用的牌：没牌可出时引擎不会再询问，讲解就接不上
  ['zhan', 'bi', 'zhan', 'xiwen'],
];
/** 牌堆顶的顺序（第一张最先被摸到） */
const PILE_TOP: string[] = [
  'zhan', 'zhan', // 你第 1 回合摸牌
  'shipo', 'qingcong', // 你的【调兵】（留一张能用的装备，这样出牌阶段不会自动结束，可以演示「结束出牌」）
  'zhan', 'zhan', 'zhan', 'zhan', 'zhan', 'zhan', 'zhan', 'zhan', // 四个电脑各摸 2 张
  'yao', 'bi', // 你第 2 回合摸牌
  'zhan', 'tiaobing', 'bi', // 击杀反贼的奖励
];

/** 玩家这一步必须做的操作 */
export type Expect =
  | { use: string; target?: number }
  | { respond: string }
  | { discard: string }
  | { end: true };

interface Beat {
  seat: number;
  /** 请求类型；respond 时还可以限定原因 */
  on: Request['type'];
  reason?: string;
  /** 行动前依次显示的讲解，每页点「下一步」继续 */
  say?: string[];
  /** 电脑按剧本行动 */
  act?: Expect;
  /** 等玩家做出这个操作；hint 是操作提示 */
  expect?: Expect;
  hint?: string;
  /** 讲解完后教程结束 */
  finish?: true;
}

const BEATS: Beat[] = [
  {
    seat: 0,
    on: 'play',
    say: [
      '欢迎！这是一局教学，大约 3 分钟。你是【主公】，身份对所有人公开；另外四人的身份是藏起来的：1 名忠臣帮你，2 名反贼要杀你，1 名内奸想活到最后。你的目标是消灭所有反贼和内奸。',
      '屏幕下方是你的手牌，旁边是你的体力（4 点）。每个回合先摸 2 张牌，然后出牌。先试试进攻：【斩】可以打距离 1 以内的人，对方不出【避】就掉 1 点体力。',
    ],
    expect: { use: 'zhan', target: 1 },
    hint: '点手牌里的【斩】，再点右边的「电脑一」，然后点「确定」。',
  },
  {
    seat: 0,
    on: 'play',
    say: ['电脑一没有【避】，受到 1 点伤害。接下来装备武器：没有武器时只能打距离 1 的人，【环首刀】让你的攻击范围变成 2。'],
    expect: { use: 'huanshoudao' },
    hint: '点【环首刀】，再点「确定」。',
  },
  {
    seat: 0,
    on: 'play',
    say: ['装好了。每个座位上都写着你到他的距离，红色表示现在打得到。再用一张锦囊牌：【调兵】让你摸 2 张牌。'],
    expect: { use: 'tiaobing' },
    hint: '点【调兵】，再点「确定」。',
  },
  {
    seat: 0,
    on: 'play',
    say: ['你摸到了【识破】和一匹马。手里的【斩】变灰了，因为每回合只能用 1 张。牌不必都打完，想留的可以留着。现在结束出牌。'],
    expect: { end: true },
    hint: '点「结束出牌」。',
  },
  {
    seat: 0,
    on: 'discard',
    say: ['回合结束时，手牌数不能超过体力。你有 5 张牌、4 点体力，要弃掉 1 张。【避】和【识破】留着防身，弃一张【斩】。'],
    expect: { discard: 'zhan' },
    hint: '点一张【斩】，再点「确定」。',
  },
  { seat: 1, on: 'play', act: { use: 'zhan', target: 0 } },
  {
    seat: 0,
    on: 'respond',
    reason: 'dodge',
    say: ['电脑一对你出了【斩】。敢对主公动手的，多半是反贼。别人【斩】你时，可以打出【避】抵消。'],
    expect: { respond: 'bi' },
    hint: '【避】已经选中，点「确定」打出。',
  },
  { seat: 2, on: 'play', act: { use: 'zhan', target: 1 } },
  {
    seat: 2,
    on: 'play',
    say: ['电脑二打了刚才攻击你的电脑一。帮主公打人的，多半是忠臣。这个游戏里，别人的身份要靠他们的行为来猜。'],
    act: { end: true },
  },
  { seat: 3, on: 'play', act: { use: 'tiejiqiang' } },
  { seat: 3, on: 'play', act: { use: 'jieying', target: 0 } },
  {
    seat: 0,
    on: 'respond',
    reason: 'shipo',
    say: ['电脑三对你用了锦囊【劫营】，要弃掉你一张牌。【识破】可以让一张锦囊对它的目标无效。'],
    expect: { respond: 'shipo' },
    hint: '【识破】已经选中，点「确定」打出。',
  },
  { seat: 3, on: 'play', act: { use: 'zhan', target: 0 } },
  {
    seat: 3,
    on: 'play',
    say: ['电脑三装了【铁脊长枪】（攻击范围 3），隔着一个座位也打得到你。你已经没有【避】了，受到 1 点伤害，体力剩 3 点。'],
    act: { end: true },
  },
  {
    seat: 0,
    on: 'play',
    say: [
      '电脑四这一轮什么都没做，可能是在观望的内奸。又轮到你了，你摸了 2 张牌。',
      '先回血：【药】回复 1 点体力。体力降到 0 会进入濒死，这时有人对你用【药】才能活下来。',
    ],
    expect: { use: 'yao' },
    hint: '点【药】，再点「确定」。',
  },
  {
    seat: 0,
    on: 'play',
    say: ['电脑一只剩 1 点体力，用【斩】解决他。'],
    expect: { use: 'zhan', target: 1 },
    hint: '点一张【斩】，再点「电脑一」，然后点「确定」。',
  },
  {
    seat: 0,
    on: 'play',
    say: [
      '电脑一阵亡，身份翻开：反贼。击杀反贼奖励摸 3 张牌。要小心的是，主公误杀忠臣会弃掉所有手牌和装备。',
      '教程到这里结束。正式对局里你可能抽到任何身份，每个武将还有自己的技能（教学局里关掉了）。看不懂的牌或技能，把鼠标停在上面（手机上长按）就有说明；「?」按钮是规则速查。',
    ],
    finish: true,
  },
];

export const TUTORIAL_STEPS = BEATS.filter((b) => b.expect).length;

/** 界面上要显示的内容 */
export interface TutorialPage {
  kind: 'say' | 'do';
  text: string;
  /** do：需要高亮的牌与座位 */
  expect?: Expect;
  /** 操作不符合提示时的提醒 */
  nudge?: boolean;
  /** 已完成的操作步数（进度条） */
  done: number;
}

function matches(e: Expect, r: Response<Request>, req: Request, hand: Card[]): boolean {
  const keyOf = (id: unknown) => hand.find((c) => c.id === id)?.key;
  if ('end' in e) return req.type === 'play' && (r as { type?: string })?.type === 'end';
  if ('use' in e) {
    const a = r as { type?: string; cardId?: number; target?: number };
    return req.type === 'play' && a?.type === 'use' && keyOf(a.cardId) === e.use && (a.target ?? undefined) === e.target;
  }
  if ('respond' in e) return req.type === 'respond' && typeof r === 'number' && keyOf(r) === e.respond;
  return req.type === 'discard' && Array.isArray(r) && r.length === req.count && r.every((id) => keyOf(id) === e.discard);
}

/** 按 Expect 生成对应的回答（电脑行动、自动演示与测试用） */
function solve(e: Expect, req: Request, hand: Card[]): Response<Request> {
  const find = (key: string) => {
    const c = hand.find((x) => x.key === key);
    if (!c) throw new Error(`教程剧本出错：手里没有【${cardDef(key).name}】`);
    return c.id;
  };
  if ('end' in e) return { type: 'end' };
  if ('use' in e) return { type: 'use', cardId: find(e.use), target: e.target };
  if ('respond' in e) return find(e.respond);
  return hand.filter((c) => c.key === e.discard).slice(0, (req as { count: number }).count).map((c) => c.id);
}

/** 剧本以外的请求：电脑和玩家都用最保守的回答 */
function fallback(view: GameView, req: Request): Response<Request> {
  switch (req.type) {
    case 'chooseGeneral':
      return req.options[0];
    case 'play':
      return { type: 'end' };
    case 'respond':
      return null;
    case 'discard':
      return (view.players[view.me].hand ?? []).slice(0, req.count).map((c) => c.id);
    case 'chooseCard':
      return { zone: 'hand' };
    case 'choose':
      return req.options[req.options.length - 1].id;
    case 'selectCards':
      return req.cards.slice(0, req.count).map((c) => c.id);
    case 'orderCards':
      return req.cards.map((c) => c.id);
  }
}

/** 教程导演：按剧本推进，并把当前要显示的讲解 / 提示交给界面 */
export class TutorialDirector {
  page: TutorialPage | null = null;
  finished = false;
  private index = 0;
  private done = 0;
  private waiting: (() => void) | null = null;
  private listeners = new Set<() => void>();

  constructor(
    private readonly human: HumanController | null,
    /** 自动演示：讲解不等待，玩家的操作按剧本自动完成（测试用） */
    private readonly auto = false,
  ) {}

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private show(page: TutorialPage | null) {
    this.page = page;
    for (const l of this.listeners) l();
  }

  /** 界面点「下一步」 */
  next(): void {
    const w = this.waiting;
    this.waiting = null;
    w?.();
  }

  /** 剧本是否已全部走完 */
  get complete(): boolean {
    return this.index >= BEATS.length;
  }

  async decide(seat: number, view: GameView, req: Request): Promise<Response<Request>> {
    const b = BEATS[this.index];
    const hit = b && b.seat === seat && b.on === req.type && (!b.reason || (req.type === 'respond' && req.reason.kind === b.reason));
    if (!hit) return fallback(view, req);
    const hand = view.players[seat].hand ?? [];

    for (const text of b.say ?? []) {
      if (this.auto) continue;
      this.show({ kind: 'say', text, done: this.done });
      await new Promise<void>((r) => (this.waiting = r));
    }
    if (b.finish) {
      this.index++;
      this.finished = true;
      this.show(null);
      return new Promise(() => {});
    }
    if (b.act) {
      this.index++;
      this.show(null);
      return solve(b.act, req, hand);
    }
    const expect = b.expect!;
    if (this.auto || !this.human) {
      this.index++;
      this.done++;
      return solve(expect, req, hand);
    }
    for (let nudge = false; ; nudge = true) {
      this.show({ kind: 'do', text: b.hint ?? '', expect, nudge, done: this.done });
      const r = await this.human.decide(view, req);
      if (matches(expect, r, req, hand)) {
        this.index++;
        this.done++;
        this.show(null);
        return r;
      }
    }
  }
}

class TutorialSeat implements Controller {
  constructor(
    private readonly director: TutorialDirector,
    private readonly seat: number,
  ) {}

  decide<R extends Request>(view: GameView, req: R): Promise<Response<R>> {
    return this.director.decide(this.seat, view, req) as Promise<Response<R>>;
  }
}

/** 从牌堆里取出一张指定种类的牌 */
function pull(game: Game, key: string): Card {
  const i = game.drawPile.findIndex((c) => c.key === key);
  if (i < 0) throw new Error(`教程发牌出错：牌堆里没有【${cardDef(key).name}】`);
  return game.drawPile.splice(i, 1)[0];
}

/** 把发好的牌收回，按剧本重新发牌并排好牌堆顶 */
function stack(game: Game): void {
  for (const p of game.players) game.drawPile.push(...p.hand.splice(0));
  game.players.forEach((p, seat) => p.hand.push(...HANDS[seat].map((k) => pull(game, k))));
  game.putOnTop(PILE_TOP.map((k) => pull(game, k)));
}

export interface Tutorial {
  game: Game;
  director: TutorialDirector;
  ais: PacedController[];
  /** 开始对局；教程不会打到分出胜负，正常情况下这个 Promise 不会结束 */
  run: () => Promise<Winner>;
}

/** human 为 null 时自动演示整局（测试用） */
export function createTutorial(human: HumanController | null, delay: () => number = () => 0, gate?: PauseGate): Tutorial {
  const director = new TutorialDirector(human, !human);
  const seats = TUTORIAL_ROLES.map((_, seat) => new TutorialSeat(director, seat));
  const ais = seats.slice(1).map((s) => new PacedController(s, delay, gate));
  const game = new Game({
    controllers: [seats[0], ...ais],
    names: TUTORIAL_NAMES,
    seed: 1,
    roles: TUTORIAL_ROLES,
    generals: TUTORIAL_GENERALS,
    disableSkills: true,
  });
  const run = async () => {
    await game.setup();
    stack(game);
    return game.loop();
  };
  return { game, director, ais, run };
}
