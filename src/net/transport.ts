/**
 * 联机连接层：房主开一个「房间」，其他人用房间号连进来，双方互发消息（普通 JSON 对象）。
 * 第一版用 PeerJS 点对点（见 peer.ts）；以后可以换成中转服务器，只需再实现这几个接口。
 */

/** 一条双向连接 */
export interface Conn {
  send(msg: unknown): void;
  onMessage(fn: (msg: unknown) => void): void;
  /** 连接断开（对方关闭页面、网络中断等），只触发一次 */
  onClose(fn: () => void): void;
  close(): void;
}

/** 房主一侧：等待别人连进来 */
export interface HostEndpoint {
  roomId: string;
  onConnection(fn: (conn: Conn) => void): void;
  close(): void;
}

export interface Transport {
  /** 开房间；roomId 不指定时随机生成 */
  host(roomId?: string): Promise<HostEndpoint>;
  /** 加入房间；房间不存在时抛出 RoomNotFound */
  join(roomId: string): Promise<Conn>;
}

export class RoomNotFound extends Error {
  constructor(roomId: string) {
    super(`房间 ${roomId} 不存在或房主已离开`);
  }
}

/** 房间号：6 位，去掉容易看错的 0/O/1/I/L */
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function randomRoomId(): string {
  let s = '';
  for (let i = 0; i < 6; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return s;
}

/** 规范化用户输入的房间号（去空格、转大写） */
export function normalizeRoomId(s: string): string {
  return s.replace(/\s+/g, '').toUpperCase();
}

// ───────────── 内存实现（测试用，同一个页面里模拟多台电脑）─────────────

class MemoryConn implements Conn {
  peer: MemoryConn | null = null;
  private msgFns: Array<(m: unknown) => void> = [];
  private closeFns: Array<() => void> = [];
  closed = false;

  send(msg: unknown): void {
    const peer = this.peer;
    if (this.closed || !peer || peer.closed) return;
    // 走一遍 JSON，保证和真实网络一样只能传普通数据
    const data = JSON.parse(JSON.stringify(msg));
    queueMicrotask(() => {
      if (!peer.closed) peer.msgFns.forEach((f) => f(data));
    });
  }

  onMessage(fn: (msg: unknown) => void): void {
    this.msgFns.push(fn);
  }

  onClose(fn: () => void): void {
    this.closeFns.push(fn);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.fireClose();
    const p = this.peer;
    if (p && !p.closed) {
      p.closed = true;
      queueMicrotask(() => p.fireClose());
    }
  }

  private fireClose() {
    const fns = this.closeFns.splice(0);
    fns.forEach((f) => f());
  }
}

export class MemoryTransport implements Transport {
  private rooms = new Map<string, (c: Conn) => void>();

  async host(roomId = randomRoomId()): Promise<HostEndpoint> {
    const fns: Array<(c: Conn) => void> = [];
    this.rooms.set(roomId, (c) => fns.forEach((f) => f(c)));
    return {
      roomId,
      onConnection: (fn) => fns.push(fn),
      close: () => this.rooms.delete(roomId),
    };
  }

  async join(roomId: string): Promise<Conn> {
    const accept = this.rooms.get(roomId);
    if (!accept) throw new RoomNotFound(roomId);
    const a = new MemoryConn();
    const b = new MemoryConn();
    a.peer = b;
    b.peer = a;
    accept(b);
    return a;
  }
}
