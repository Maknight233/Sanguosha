/**
 * 房主：在自己的浏览器里跑完整引擎，把每个座位「能看到的局面」发给对应的玩家，收集他们的回答。
 * 别人收不到其他人的手牌和隐藏身份；房主本人技术上能看到全部（熟人局可以接受）。
 */
import { BasicAI } from '../ai/basic';
import { Game } from '../engine/game';
import { RecordingController, type Answer } from '../engine/record';
import type { Controller, GameView, Request, Response, Winner } from '../engine/types';
import { PacedController } from '../ui/controllers';
import { snapshotOf, type TableClient, type TableOver, type TableSnapshot } from '../ui/table';
import {
  HOST_HEARTBEAT,
  isClientMsg,
  timeLimit,
  type ClientMsg,
  type Heartbeat,
  type HostMsg,
  type LobbyState,
  type MemberInfo,
  type RoomSettings,
  type SeatInfo,
  type SharedRecord,
} from './protocol';
import type { Conn, HostEndpoint } from './transport';

/** 电脑座位每次决策前的停顿（毫秒），让大家看清局势 */
export const AI_DELAY = 700;
/** 掉线托管时电脑代打的停顿 */
export const AWAY_DELAY = 400;
const AI_NAMES = ['一', '二', '三', '四', '五', '六', '七'];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function randomId(): string {
  return Math.random().toString(36).slice(2, 10);
}

interface Pending {
  id: number;
  req: Request;
  view: GameView;
  deadline: number | null;
  resolve: (r: Response<Request>) => void;
}

/**
 * 真人座位的控制器：把询问挂起等玩家回答；超时由电脑代答这一次；掉线（托管）时一律由电脑回答。
 */
export class SeatController implements Controller {
  pending: Pending | null = null;
  away = false;
  cancelled = false;
  private nextId = 1;
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** 选择「不识破」的群体锦囊牌 id */
  private skipShipoTrick: number | null = null;

  constructor(
    private readonly ai: Controller,
    private readonly limit: (req: Request) => number | null,
    private readonly onChange: () => void,
    private readonly awayDelay = AWAY_DELAY,
  ) {}

  async decide<R extends Request>(view: GameView, req: R): Promise<Response<R>> {
    if (this.cancelled) return new Promise(() => {});
    if (this.skipsShipo(req)) return null as Response<R>;
    if (this.away) {
      if (this.awayDelay > 0) await sleep(this.awayDelay);
      if (this.cancelled) return new Promise(() => {});
      return this.ai.decide(view, req);
    }
    return new Promise((res) => {
      const ms = this.limit(req);
      const p: Pending = {
        id: this.nextId++,
        req,
        view,
        deadline: ms === null ? null : Date.now() + ms,
        resolve: (r) => {
          if (this.pending !== p) return;
          this.clearTimer();
          this.pending = null;
          this.onChange();
          res(r as Response<R>);
        },
      };
      this.pending = p;
      if (ms !== null) this.timer = setTimeout(() => void this.autoAnswer(p), ms);
      this.onChange();
    });
  }

  /** 玩家的回答；编号对不上（过期的回答）忽略 */
  answer(id: number, r: Response<Request>): void {
    if (this.pending?.id === id) this.pending.resolve(r);
  }

  skipShipo(id: number, trickId: number): void {
    if (this.pending?.id !== id) return;
    this.skipShipoTrick = trickId;
    this.pending.resolve(null);
  }

  /** 掉线 / 回来 */
  setAway(away: boolean): void {
    if (this.away === away) return;
    this.away = away;
    this.onChange();
    if (away && this.pending) void this.autoAnswer(this.pending);
  }

  cancel(): void {
    this.cancelled = true;
    this.clearTimer();
  }

  private async autoAnswer(p: Pending): Promise<void> {
    if (this.pending !== p || this.cancelled) return;
    const r = await this.ai.decide(p.view, p.req);
    p.resolve(r);
  }

  private clearTimer() {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private skipsShipo(req: Request): boolean {
    if (req.type !== 'respond' || req.reason.kind !== 'shipo') return false;
    return !req.reason.countering && req.reason.trickId !== undefined && req.reason.trickId === this.skipShipoTrick;
  }
}

interface Member {
  id: string;
  token: string;
  name: string;
  ready: boolean;
  host: boolean;
  conn: Conn | null;
}

/** 正在进行的一局 */
class Match {
  game!: Game;
  /** 各座位：真人为控制器，电脑为 null */
  seats: (SeatController | null)[] = [];
  /** 各座位的真人成员 id */
  seatMember: (string | null)[] = [];
  ais: PacedController[] = [];
  answers: Answer[] = [];
  seed = 0;
  over: TableOver | null = null;
  record: SharedRecord | null = null;
  /** 已经发给各成员的日志条数 */
  sentLog = new Map<string, number>();

  seatOf(memberId: string): number {
    return this.seatMember.indexOf(memberId);
  }

  cancel() {
    this.seats.forEach((s) => s?.cancel());
    this.ais.forEach((a) => (a.cancelled = true));
  }
}

export interface HostOptions {
  /** 测试用：固定随机种子与座位，缩短电脑停顿 */
  seed?: number;
  aiDelay?: number;
  awayDelay?: number;
  /** 指定各真人的座位（按成员加入顺序） */
  seatOrder?: number[];
  /** 测试用：覆盖每次操作的时限 */
  limit?: (req: Request) => number | null;
  heartbeat?: Heartbeat;
}

export class HostRoom {
  readonly members: Member[] = [];
  settings: RoomSettings;
  match: Match | null = null;
  private listeners = new Set<() => void>();
  private flushQueued = false;
  private closed = false;
  /** 各连接最后一次收到消息的时间 */
  private lastSeen = new Map<Conn, number>();
  private beat: ReturnType<typeof setInterval>;

  constructor(
    private readonly endpoint: HostEndpoint,
    hostName: string,
    settings: RoomSettings,
    private readonly opts: HostOptions = {},
  ) {
    this.settings = { ...settings };
    this.members.push({ id: randomId(), token: '', name: cleanName(hostName) || '房主', ready: true, host: true, conn: null });
    endpoint.onConnection((c) => this.accept(c));
    const hb = opts.heartbeat ?? HOST_HEARTBEAT;
    this.beat = setInterval(() => this.heartbeat(hb), hb.every);
  }

  /** 给每个连接发心跳；太久没收到消息的当作断线 */
  private heartbeat(hb: Heartbeat): void {
    const now = Date.now();
    for (const [conn, seen] of this.lastSeen) {
      if (now - seen > hb.timeout) {
        this.lastSeen.delete(conn);
        conn.close();
      } else conn.send({ t: 'ping' } satisfies HostMsg);
    }
  }

  get roomId(): string {
    return this.endpoint.roomId;
  }

  get hostMember(): Member {
    return this.members[0];
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  lobby(): LobbyState {
    return {
      roomId: this.roomId,
      settings: { ...this.settings },
      playing: !!this.match,
      members: this.members.map(
        (m): MemberInfo => ({ id: m.id, name: m.name, ready: m.ready, host: m.host, online: m.host || m.conn !== null }),
      ),
    };
  }

  /** 修改设置（只能在房间里、人数不能少于已进房的人数） */
  setSettings(s: Partial<RoomSettings>): void {
    if (this.match) return;
    const next = { ...this.settings, ...s };
    if (next.players < this.members.length) return;
    this.settings = next;
    this.broadcastLobby();
  }

  /** 是否可以开局：除房主外都已准备 */
  canStart(): boolean {
    return !this.match && this.members.every((m) => m.ready) && this.members.length <= this.settings.players;
  }

  start(): void {
    if (!this.canStart()) return;
    const n = this.settings.players;
    const m = new Match();
    m.seed = this.opts.seed ?? Math.floor(Math.random() * 1e9);
    const order = this.opts.seatOrder ?? shuffle(Array.from({ length: n }, (_, i) => i));
    m.seatMember = Array.from({ length: n }, () => null);
    this.members.forEach((mem, i) => (m.seatMember[order[i]] = mem.id));
    let ai = 0;
    const names = m.seatMember.map((id) => (id ? this.member(id)!.name : `电脑${AI_NAMES[ai++]}`));
    const level = this.settings.level;
    const timer = this.settings.timer;
    const controllers = m.seatMember.map((id, seat) => {
      let c: Controller;
      if (id) {
        const sc = new SeatController(new BasicAI(level), this.opts.limit ?? ((req) => timeLimit(timer, req)), () => this.queueFlush(), this.opts.awayDelay);
        sc.away = !this.member(id)!.host && !this.member(id)!.conn;
        m.seats[seat] = sc;
        c = sc;
      } else {
        const pc = new PacedController(new BasicAI(level), () => this.opts.aiDelay ?? AI_DELAY);
        m.seats[seat] = null;
        m.ais.push(pc);
        c = pc;
      }
      return new RecordingController(c, seat, m.answers);
    });
    const humanSeats = m.seatMember.flatMap((id, seat) => (id ? [seat] : []));
    m.game = new Game({ controllers, names, seed: m.seed, mulligan: humanSeats });
    m.game.subscribe(() => this.queueFlush());
    this.match = m;
    this.members.forEach((mem) => m.sentLog.set(mem.id, 0));
    this.broadcastLobby();
    m.game.start().then(
      (w) => this.finish(m, w),
      (e) => console.error(e),
    );
  }

  /** 对局结束后回到房间（大家重新准备） */
  backToLobby(): void {
    if (!this.match) return;
    this.match.cancel();
    this.match = null;
    // 已经掉线的人不再留座
    for (let i = this.members.length - 1; i >= 1; i--) if (!this.members[i].conn) this.members.splice(i, 1);
    this.members.forEach((m) => (m.ready = m.host));
    this.broadcastLobby();
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.beat);
    this.match?.cancel();
    for (const m of this.members) {
      const c = m.conn;
      c?.send({ t: 'closed' } satisfies HostMsg);
      // 稍等再断开，保证「房间关闭」的消息送到
      if (c) setTimeout(() => c.close(), 200);
    }
    setTimeout(() => this.endpoint.close(), 200);
  }

  /** 房主自己的牌桌 */
  hostTable(): TableClient | null {
    const m = this.match;
    if (!m) return null;
    const seat = m.seatOf(this.hostMember.id);
    return new HostSeatTable(this, m, seat);
  }

  seatInfo(m: Match): SeatInfo[] {
    return m.seatMember.map((id, seat) => ({ member: id, away: !!m.seats[seat]?.away }));
  }

  /** 生成某座位的快照 */
  snapshotFor(m: Match, seat: number): TableSnapshot {
    const sc = m.seats[seat];
    const snap = snapshotOf(m.game, seat, sc?.pending?.req ?? null, m.over);
    return { ...snap, online: { deadline: sc?.pending?.deadline ?? null, seats: this.seatInfo(m) } };
  }

  resignSeat(seat: number): void {
    const m = this.match;
    if (!m || !m.game.canResign(seat)) return;
    m.game.resign(seat);
    const sc = m.seats[seat];
    // 正在等他操作时，随便交一个回答让引擎继续（认输在回答后立即生效）
    if (sc?.pending) sc.answer(sc.pending.id, null);
  }

  emit(): void {
    this.listeners.forEach((l) => l());
  }

  // ───────────── 内部 ─────────────

  private member(id: string): Member | undefined {
    return this.members.find((m) => m.id === id);
  }

  private accept(conn: Conn): void {
    let me: Member | null = null;
    this.lastSeen.set(conn, Date.now());
    conn.onMessage((raw) => {
      if (this.lastSeen.has(conn)) this.lastSeen.set(conn, Date.now());
      if (!isClientMsg(raw)) return;
      if (!me) {
        if (raw.t !== 'hello') return;
        me = this.hello(conn, raw);
        return;
      }
      if (me.conn === conn) this.handle(me, raw);
    });
    conn.onClose(() => {
      this.lastSeen.delete(conn);
      if (me && me.conn === conn) this.disconnected(me);
    });
  }

  private hello(conn: Conn, msg: Extract<ClientMsg, { t: 'hello' }>): Member | null {
    const reject = (reason: string) => {
      conn.send({ t: 'reject', reason } satisfies HostMsg);
      setTimeout(() => conn.close(), 200);
      return null;
    };
    if (this.closed) return reject('房间已关闭');
    const token = String(msg.token ?? '');
    let me = token ? this.members.find((m) => !m.host && m.token === token) : undefined;
    if (me) {
      // 重连：换成新连接，收回座位
      const old = me.conn;
      me.conn = conn;
      old?.close();
      const seat = this.match?.seatOf(me.id) ?? -1;
      if (this.match && seat >= 0) {
        this.match.sentLog.set(me.id, 0);
        this.match.seats[seat]?.setAway(false);
      }
    } else {
      if (this.match) return reject('对局已经开始，等这一局结束后再进');
      if (this.members.length >= this.settings.players) return reject('房间已满');
      me = { id: randomId(), token, name: this.uniqueName(cleanName(msg.name) || '玩家'), ready: false, host: false, conn };
      this.members.push(me);
    }
    conn.send({ t: 'welcome', you: me.id } satisfies HostMsg);
    this.broadcastLobby();
    this.queueFlush();
    // 掉线期间对局已经结束：补发回放数据
    const rec = this.match?.record;
    if (rec && this.match!.seatOf(me.id) >= 0) setTimeout(() => me!.conn?.send({ t: 'record', record: rec } satisfies HostMsg), 0);
    return me;
  }

  private handle(me: Member, msg: ClientMsg): void {
    const m = this.match;
    const seat = m ? m.seatOf(me.id) : -1;
    switch (msg.t) {
      case 'ready':
        if (!m) {
          me.ready = !!msg.ready;
          this.broadcastLobby();
        }
        return;
      case 'answer':
        if (m && seat >= 0) m.seats[seat]?.answer(msg.id, msg.r);
        return;
      case 'skipShipo':
        if (m && seat >= 0) m.seats[seat]?.skipShipo(msg.id, msg.trickId);
        return;
      case 'resign':
        if (seat >= 0) this.resignSeat(seat);
        return;
      case 'ping':
        return;
      case 'leave': {
        const c = me.conn;
        this.disconnected(me);
        c?.close();
        return;
      }
    }
  }

  private disconnected(me: Member): void {
    me.conn = null;
    const m = this.match;
    const seat = m ? m.seatOf(me.id) : -1;
    if (m && seat >= 0) {
      // 对局中：电脑托管，保留座位等他回来
      m.seats[seat]?.setAway(true);
    } else {
      const i = this.members.indexOf(me);
      if (i > 0) this.members.splice(i, 1);
    }
    this.broadcastLobby();
  }

  private uniqueName(name: string): string {
    const taken = new Set(this.members.map((m) => m.name));
    if (!taken.has(name)) return name;
    for (let i = 2; ; i++) if (!taken.has(`${name}${i}`)) return `${name}${i}`;
  }

  private broadcastLobby(): void {
    const lobby = this.lobby();
    for (const m of this.members) m.conn?.send({ t: 'lobby', lobby } satisfies HostMsg);
    this.emit();
  }

  private finish(m: Match, w: Winner): void {
    if (this.match !== m) return;
    const g = m.game;
    m.over = { winner: w, players: g.players, turn: g.turn, resigned: g.resigned };
    m.seats.forEach((s) => s?.cancel());
    m.record = {
      seed: m.seed,
      names: g.players.map((p) => p.name),
      answers: m.answers,
      winner: w,
      turns: g.turn,
      logLength: g.log.length,
      ...(g.resigned ? { resign: g.resigned } : {}),
      mulligan: m.seatMember.flatMap((id, seat) => (id ? [seat] : [])),
      level: this.settings.level,
      roles: g.players.map((p) => p.role),
      generals: g.players.map((p) => p.general),
      alive: g.players.map((p) => p.alive),
    };
    this.flush();
    for (const mem of this.members) mem.conn?.send({ t: 'record', record: m.record } satisfies HostMsg);
    this.broadcastLobby();
  }

  private queueFlush(): void {
    if (this.flushQueued) return;
    this.flushQueued = true;
    setTimeout(() => {
      this.flushQueued = false;
      this.flush();
    }, 0);
  }

  /** 把最新局面发给每个在线的真人玩家，并通知房主自己的界面 */
  private flush(): void {
    const m = this.match;
    if (m) {
      const seats = this.seatInfo(m);
      for (const mem of this.members) {
        if (!mem.conn) continue;
        const seat = m.seatOf(mem.id);
        if (seat < 0) continue;
        const { log, ...snap } = this.snapshotFor(m, seat);
        const from = m.sentLog.get(mem.id) ?? 0;
        const sc = m.seats[seat];
        const deadline = sc?.pending?.deadline ?? null;
        mem.conn.send({
          t: 'table',
          snap,
          logFrom: from,
          log: log.slice(from),
          pendingId: sc?.pending?.id ?? null,
          timeLeft: deadline === null ? null : Math.max(0, deadline - Date.now()),
          seats,
        } satisfies HostMsg);
        m.sentLog.set(mem.id, log.length);
      }
    }
    this.emit();
  }
}

/** 房主自己的牌桌（和别人一样走座位控制器，同样有倒计时） */
class HostSeatTable implements TableClient {
  constructor(
    private readonly room: HostRoom,
    private readonly m: Match,
    private readonly seat: number,
  ) {}

  snapshot(): TableSnapshot {
    return this.room.snapshotFor(this.m, this.seat);
  }

  subscribe(fn: () => void): () => void {
    return this.room.subscribe(fn);
  }

  answer(r: Response<Request>): void {
    const sc = this.m.seats[this.seat];
    if (sc?.pending) sc.answer(sc.pending.id, r);
  }

  skipShipo(trickId: number): void {
    const sc = this.m.seats[this.seat];
    if (sc?.pending) sc.skipShipo(sc.pending.id, trickId);
  }

  resign(): void {
    this.room.resignSeat(this.seat);
  }
}

/** 昵称：去掉首尾空白，最多 8 个字 */
export function cleanName(s: unknown): string {
  return [...String(s ?? '').trim().replace(/\s+/g, ' ')].slice(0, 8).join('');
}

function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
