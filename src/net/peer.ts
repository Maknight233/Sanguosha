/**
 * PeerJS 点对点连接：用 PeerJS 的免费公共服务交换连接信息，之后浏览器之间直连（WebRTC）。
 * 某些网络（对称 NAT、部分公司网 / 手机流量）可能连不上，以后可换成中转服务器。
 */
import type { DataConnection, Peer as PeerType } from 'peerjs';
import { randomRoomId, RoomNotFound, type Conn, type HostEndpoint, type Transport } from './transport';

/** 公共服务里的 id 是全局的，加个前缀避免和别的应用撞车 */
const PREFIX = 'sanguo-identity-room-';
const OPEN_TIMEOUT = 15000;

async function loadPeer(): Promise<typeof PeerType> {
  // 只有联机时才加载
  const mod = await import('peerjs');
  return mod.Peer;
}

function wrap(dc: DataConnection, peer?: PeerType): Conn {
  let closed = false;
  const closeFns: Array<() => void> = [];
  const fireClose = () => {
    if (closed) return;
    closed = true;
    closeFns.splice(0).forEach((f) => f());
    peer?.destroy();
  };
  dc.on('close', fireClose);
  dc.on('error', fireClose);
  peer?.on('disconnected', () => peer.reconnect());
  peer?.on('error', (e) => {
    if ((e as { type?: string }).type !== 'network') return;
    fireClose();
  });
  // ICE 断开时 DataConnection 不一定触发 close，自己盯着
  const pc = dc.peerConnection;
  if (pc) {
    pc.addEventListener('iceconnectionstatechange', () => {
      if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'closed') fireClose();
    });
  }
  return {
    send: (msg) => {
      if (!closed && dc.open) dc.send(msg);
    },
    onMessage: (fn) => dc.on('data', (d) => fn(d)),
    onClose: (fn) => (closed ? fn() : closeFns.push(fn)),
    close: () => {
      dc.close();
      fireClose();
    },
  };
}

function timeout<T>(p: Promise<T>, ms: number, msg: string): Promise<T> {
  return new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error(msg)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        res(v);
      },
      (e) => {
        clearTimeout(t);
        rej(e);
      },
    );
  });
}

export class PeerTransport implements Transport {
  async host(roomId?: string): Promise<HostEndpoint> {
    const Peer = await loadPeer();
    // 房间号撞车时换一个重试
    for (let attempt = 0; attempt < 5; attempt++) {
      const id = roomId ?? randomRoomId();
      const peer = new Peer(PREFIX + id);
      try {
        await timeout(
          new Promise<void>((res, rej) => {
            peer.on('open', () => res());
            peer.on('error', (e) => rej(e));
          }),
          OPEN_TIMEOUT,
          '连接联机服务超时，请检查网络后重试',
        );
      } catch (e) {
        peer.destroy();
        if ((e as { type?: string }).type === 'unavailable-id' && !roomId) continue;
        throw e;
      }
      const fns: Array<(c: Conn) => void> = [];
      peer.on('connection', (dc) => {
        dc.on('open', () => {
          const c = wrap(dc);
          fns.forEach((f) => f(c));
        });
      });
      // 和公共服务断开不影响已有连接，但新的人进不来，自动重连
      peer.on('disconnected', () => {
        if (!peer.destroyed) peer.reconnect();
      });
      return { roomId: id, onConnection: (fn) => fns.push(fn), close: () => peer.destroy() };
    }
    throw new Error('无法创建房间，请重试');
  }

  async join(roomId: string): Promise<Conn> {
    const Peer = await loadPeer();
    const peer = new Peer();
    try {
      return await timeout(
        new Promise<Conn>((res, rej) => {
          peer.on('error', (e) => rej((e as { type?: string }).type === 'peer-unavailable' ? new RoomNotFound(roomId) : e));
          peer.on('open', () => {
            const dc = peer.connect(PREFIX + roomId, { reliable: true, serialization: 'json' });
            dc.on('open', () => res(wrap(dc, peer)));
          });
        }),
        OPEN_TIMEOUT,
        '连接房主超时：可能是网络限制了点对点连接，换个网络（如手机热点）再试',
      );
    } catch (e) {
      peer.destroy();
      throw e;
    }
  }
}
