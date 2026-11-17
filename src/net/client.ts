/** 加入别人房间的玩家：接收房主发来的局面，把回答发回去；断线后自动重连 */
import type { LogEntry, Request, Response } from '../engine/types';
import type { TableClient, TableSnapshot } from '../ui/table';
import { CLIENT_HEARTBEAT, type ClientMsg, type Heartbeat, type HostMsg, type LobbyState, type SharedRecord } from './protocol';
import { RoomNotFound, type Conn, type Transport } from './transport';

export type ClientStatus =
  /** 正在连接 */
  | 'connecting'
  /** 已连上（在房间里或对局中） */
  | 'connected'
  /** 断线，正在重连 */
  | 'reconnecting'
  /** 结束：被拒绝、房间关闭、重连失败或自己离开 */
  | 'ended';

/** 重连间隔与最长尝试时间 */
export const RECONNECT_EVERY = 3000;
export const RECONNECT_FOR = 90_000;

/** 对局中由房主发来的牌桌 */
export class RemoteTable implements TableClient {
  private snap: TableSnapshot | null = null;
  private log: LogEntry[] = [];
  private pendingId: number | null = null;
  private listeners = new Set<() => void>();

  constructor(private readonly send: (m: ClientMsg) => void) {}

  get ready(): boolean {
    return this.snap !== null;
  }

  apply(msg: Extract<HostMsg, { t: 'table' }>): void {
    // 出牌记录增量：从 logFrom 开始覆盖（重连时房主会从 0 重发）
    this.log = msg.logFrom <= this.log.length ? [...this.log.slice(0, msg.logFrom), ...msg.log] : [...this.log, ...msg.log];
    this.pendingId = msg.pendingId;
    const deadline = msg.timeLeft === null ? null : Date.now() + msg.timeLeft;
    this.snap = { ...msg.snap, log: this.log, online: { deadline, seats: msg.seats } };
    this.emit();
  }

  snapshot(): TableSnapshot {
    return this.snap!;
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  answer(r: Response<Request>): void {
    if (this.pendingId === null || !this.snap) return;
    this.send({ t: 'answer', id: this.pendingId, r });
    this.clearPending();
  }

  skipShipo(trickId: number): void {
    if (this.pendingId === null || !this.snap) return;
    this.send({ t: 'skipShipo', id: this.pendingId, trickId });
    this.clearPending();
  }

  resign(): void {
    this.send({ t: 'resign' });
  }

  /** 回答发出后先在本地收起询问，等房主的新局面 */
  private clearPending() {
    this.pendingId = null;
    if (this.snap) this.snap = { ...this.snap, pending: null, online: this.snap.online && { ...this.snap.online, deadline: null } };
    this.emit();
  }

  private emit() {
    this.listeners.forEach((l) => l());
  }
}

export class ClientRoom {
  status: ClientStatus = 'connecting';
  /** 结束原因（被拒绝、房间关闭等） */
  error: string | null = null;
  lobby: LobbyState | null = null;
  /** 我在房间里的成员 id */
  you: string | null = null;
  /** 对局中的牌桌（在房间里时为 null） */
  table: RemoteTable | null = null;
  /** 最近一局结束后的回放数据 */
  record: SharedRecord | null = null;
  private conn: Conn | null = null;
  private listeners = new Set<() => void>();
  private lostAt = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private beat: ReturnType<typeof setInterval> | null = null;
  private lastSeen = 0;

  constructor(
    private readonly transport: Transport,
    readonly roomId: string,
    private readonly name: string,
    private readonly token: string,
    private readonly retry = { every: RECONNECT_EVERY, for: RECONNECT_FOR },
    private readonly hb: Heartbeat = CLIENT_HEARTBEAT,
  ) {}

  /** 心跳：定时发 ping；太久没收到房主的消息就断开重连 */
  private heartbeat(): void {
    const conn = this.conn;
    if (!conn) return;
    if (Date.now() - this.lastSeen > this.hb.timeout) conn.close();
    else conn.send({ t: 'ping' } satisfies ClientMsg);
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** 第一次连接；失败时抛出（房间不存在等） */
  async connect(): Promise<void> {
    const conn = await this.transport.join(this.roomId);
    this.attach(conn);
  }

  setReady(ready: boolean): void {
    this.send({ t: 'ready', ready });
  }

  leave(): void {
    this.send({ t: 'leave' });
    this.end(null);
  }

  private send(m: ClientMsg): void {
    this.conn?.send(m);
  }

  private attach(conn: Conn): void {
    this.conn = conn;
    this.lastSeen = Date.now();
    this.beat ??= setInterval(() => this.heartbeat(), this.hb.every);
    conn.onMessage((raw) => {
      if (this.conn !== conn) return;
      this.lastSeen = Date.now();
      this.handle(raw as HostMsg);
    });
    conn.onClose(() => {
      if (this.conn === conn) this.lost();
    });
    conn.send({ t: 'hello', name: this.name, token: this.token } satisfies ClientMsg);
  }

  private handle(msg: HostMsg): void {
    switch (msg.t) {
      case 'welcome':
        this.you = msg.you;
        this.status = 'connected';
        break;
      case 'reject':
        this.end(msg.reason);
        return;
      case 'closed':
        this.end('房主关闭了房间');
        return;
      case 'lobby':
        this.lobby = msg.lobby;
        // 对局中途回到房间（房主取消了这一局）：收起牌桌；已结束的牌桌留着看结算，自己点返回
        if (!msg.lobby.playing && this.table && !(this.table.ready && this.table.snapshot().over)) this.table = null;
        break;
      case 'table':
        if (!this.table || (this.table.ready && this.table.snapshot().over && !msg.snap.over)) {
          // 新的一局
          this.table = new RemoteTable((m) => this.send(m));
          this.record = null;
        }
        this.table.apply(msg);
        break;
      case 'record':
        this.record = msg.record;
        break;
      case 'ping':
        return;
    }
    this.emit();
  }

  /** 回到房间界面（结算后） */
  leaveTable(): void {
    if (this.table?.ready && !this.table.snapshot().over && this.lobby?.playing) return;
    this.table = null;
    this.emit();
  }

  private lost(): void {
    this.conn = null;
    if (this.status === 'ended') return;
    if (this.status !== 'reconnecting') this.lostAt = Date.now();
    this.status = 'reconnecting';
    this.emit();
    this.retryTimer = setTimeout(() => void this.reconnect(), this.retry.every);
  }

  private async reconnect(): Promise<void> {
    this.retryTimer = null;
    if (this.status !== 'reconnecting') return;
    try {
      const conn = await this.transport.join(this.roomId);
      if (this.status !== 'reconnecting') return conn.close();
      this.attach(conn);
    } catch (e) {
      if (this.status !== 'reconnecting') return;
      if (Date.now() - this.lostAt >= this.retry.for) {
        this.end(e instanceof RoomNotFound ? '房主已离开，房间关闭' : '连接断开，重连失败');
        return;
      }
      this.retryTimer = setTimeout(() => void this.reconnect(), this.retry.every);
    }
  }

  private end(reason: string | null): void {
    this.status = 'ended';
    this.error = reason;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.beat) clearInterval(this.beat);
    this.beat = null;
    const c = this.conn;
    this.conn = null;
    c?.close();
    this.emit();
  }

  private emit() {
    this.listeners.forEach((l) => l());
  }
}
