import { describe, expect, it } from 'vitest';
import { BasicAI } from '../src/ai/basic';
import { replay, RECORD_VERSION, type GameRecord } from '../src/engine/record';
import { ClientRoom } from '../src/net/client';
import { HostRoom } from '../src/net/host';
import type { RoomSettings, SharedRecord } from '../src/net/protocol';
import { MemoryTransport, RoomNotFound } from '../src/net/transport';
import type { TableClient, TableSnapshot } from '../src/ui/table';

const settings = (players: number, timer: RoomSettings['timer'] = 'none'): RoomSettings => ({ players, level: 'normal', timer });

async function waitFor(cond: () => boolean, ms = 20000): Promise<void> {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error('等待超时');
    await new Promise((r) => setTimeout(r, 2));
  }
}

/** 用电脑 AI 替一个牌桌自动回答（模拟真人） */
function autoPlay(table: TableClient, onSnap?: (s: TableSnapshot) => void): () => void {
  const ai = new BasicAI('normal');
  let busy = false;
  const step = async () => {
    const snap = table.snapshot();
    onSnap?.(snap);
    if (busy || !snap.pending || snap.over) return;
    busy = true;
    const r = await ai.decide(snap.view, snap.pending);
    busy = false;
    table.answer(r);
  };
  const unsub = table.subscribe(() => void step());
  void step();
  return unsub;
}

/** 检查快照里没有别人的手牌和隐藏身份（身份局，无人亮身份的 5 人局） */
function assertNoLeak(s: TableSnapshot) {
  for (const p of s.view.players) {
    if (p.seat === s.me) continue;
    expect(p.hand).toBeNull();
    if (p.alive && p.role !== 'lord') expect(p.role).toBeNull();
  }
}

async function makeRoom(players: number, guests: string[], opts: ConstructorParameters<typeof HostRoom>[3] = {}, retryEvery = 5) {
  const net = new MemoryTransport();
  const host = new HostRoom(await net.host('ROOM01'), '房主', settings(players), { aiDelay: 0, awayDelay: 0, ...opts });
  const clients: ClientRoom[] = [];
  for (const [i, name] of guests.entries()) {
    const c = new ClientRoom(net, 'ROOM01', name, `token-${i}`, { every: retryEvery, for: 2000 });
    await c.connect();
    clients.push(c);
  }
  await waitFor(() => clients.every((c) => c.status === 'connected') && host.members.length === guests.length + 1);
  return { net, host, clients };
}

function toRecord(r: SharedRecord, seat: number): GameRecord {
  return {
    version: RECORD_VERSION,
    id: 'x',
    date: 0,
    seed: r.seed,
    names: r.names,
    human: seat,
    answers: r.answers,
    winner: r.winner,
    turns: r.turns,
    role: r.roles[seat],
    general: r.generals[seat],
    won: false,
    logLength: r.logLength,
    mulligan: r.mulligan,
    ...(r.resign ? { resign: r.resign } : {}),
  };
}

describe('联机：房间', () => {
  it('昵称去重，准备齐了才能开局，人数不能少于已进房人数', async () => {
    const { host, clients } = await makeRoom(5, ['小明', '小明']);
    expect(host.lobby().members.map((m) => m.name)).toEqual(['房主', '小明', '小明2']);
    expect(host.canStart()).toBe(false);
    clients.forEach((c) => c.setReady(true));
    await waitFor(() => host.canStart());
    host.setSettings({ players: 2 });
    expect(host.settings.players).toBe(5);
    host.setSettings({ players: 4 });
    expect(host.settings.players).toBe(4);
    await waitFor(() => clients[0].lobby?.settings.players === 4);
  });

  it('房间满了、对局已开始、房间不存在时进不去', async () => {
    const { net, host, clients } = await makeRoom(2, ['甲']);
    const full = new ClientRoom(net, 'ROOM01', '乙', 'tok-b');
    await full.connect();
    await waitFor(() => full.status === 'ended');
    expect(full.error).toBe('房间已满');
    clients[0].setReady(true);
    await waitFor(() => host.canStart());
    host.start();
    await expect(net.join('NOPE00')).rejects.toBeInstanceOf(RoomNotFound);
    host.close();
    await waitFor(() => clients[0].status === 'ended');
    expect(clients[0].error).toBe('房主关闭了房间');
  });
});

describe('联机：对局', { timeout: 30000 }, () => {
  it('5 人局（2 名真人 + 房主 + 2 名电脑）打完，不泄露信息，回放一致', async () => {
    const { host, clients } = await makeRoom(5, ['甲', '乙'], { seed: 11, seatOrder: [0, 2, 3] });
    clients.forEach((c) => c.setReady(true));
    await waitFor(() => host.canStart());
    host.start();
    const stops = [autoPlay(host.hostTable()!)];
    await waitFor(() => clients.every((c) => c.table?.ready));
    let checked = 0;
    for (const c of clients)
      stops.push(
        autoPlay(c.table!, (s) => {
          if (!s.over) {
            assertNoLeak(s);
            checked++;
          }
        }),
      );
    await waitFor(() => !!host.match?.record && clients.every((c) => c.record));
    stops.forEach((s) => s());
    expect(checked).toBeGreaterThan(20);
    const m = host.match!;
    // 每个人的出牌记录与房主一致；结算时公开所有身份
    for (const c of clients) {
      const snap = c.table!.snapshot();
      expect(snap.log.map((e) => e.text)).toEqual(m.game.log.map((e) => e.text));
      expect(snap.over?.players.map((p) => p.role)).toEqual(m.game.players.map((p) => p.role));
    }
    expect(clients[0].table!.snapshot().me).toBe(2);
    expect(m.record!.mulligan).toEqual([0, 2, 3]);
    const res = await replay(toRecord(clients[1].record!, 3));
    expect(res.error).toBeNull();
    expect(res.log.length).toBe(m.game.log.length);
    // 回到房间：大家要重新准备
    host.backToLobby();
    await waitFor(() => clients.every((c) => c.lobby && !c.lobby.playing));
    expect(host.lobby().members.map((x) => x.ready)).toEqual([true, false, false]);
  });

  it('1v1：房主对一名真人', async () => {
    const { host, clients } = await makeRoom(2, ['甲'], { seed: 5 });
    clients[0].setReady(true);
    await waitFor(() => host.canStart());
    host.start();
    const stops = [autoPlay(host.hostTable()!)];
    await waitFor(() => !!clients[0].table?.ready);
    stops.push(autoPlay(clients[0].table!));
    await waitFor(() => !!clients[0].record);
    stops.forEach((s) => s());
    expect(host.match!.game.players.length).toBe(2);
    expect((await replay(toRecord(clients[0].record!, 0))).error).toBeNull();
  });

  it('2v2：房主与三名真人', async () => {
    const { host, clients } = await makeRoom(4, ['甲', '乙', '丙'], { seed: 8 });
    clients.forEach((c) => c.setReady(true));
    await waitFor(() => host.canStart());
    host.start();
    const stops = [autoPlay(host.hostTable()!)];
    await waitFor(() => clients.every((c) => c.table?.ready));
    clients.forEach((c) => stops.push(autoPlay(c.table!)));
    await waitFor(() => clients.every((c) => c.record));
    stops.forEach((s) => s());
    expect(host.match!.ais.length).toBe(0);
  });

  it('超时：不操作的人由电脑代答，对局照常结束', async () => {
    const { host, clients } = await makeRoom(5, ['挂机'], { seed: 3, limit: () => 1 });
    clients[0].setReady(true);
    await waitFor(() => host.canStart());
    host.start();
    const stop = autoPlay(host.hostTable()!);
    await waitFor(() => !!clients[0].record);
    stop();
    // 挂机的人一直有倒计时
    expect(clients[0].table!.snapshot().online).toBeDefined();
  });

  it('掉线后电脑托管，重连收回座位并补齐出牌记录', async () => {
    const { host, clients } = await makeRoom(5, ['甲'], { seed: 21, seatOrder: [0, 1] }, 300);
    const c = clients[0];
    c.setReady(true);
    await waitFor(() => host.canStart());
    host.start();
    const stops = [autoPlay(host.hostTable()!)];
    await waitFor(() => !!c.table?.ready);
    // 断开连接（模拟网络中断）
    (c as unknown as { conn: { close(): void } }).conn.close();
    await waitFor(() => host.match!.seats[1]!.away);
    expect(host.snapshotFor(host.match!, 0).online!.seats[1].away).toBe(true);
    await waitFor(() => host.match!.game.log.length > 40);
    // 自动重连：座位收回，出牌记录从头补齐
    await waitFor(() => c.status === 'connected' && !host.match!.seats[1]!.away && !!c.table?.ready);
    stops.push(autoPlay(c.table!));
    await waitFor(() => !!c.record);
    stops.forEach((s) => s());
    expect(c.table!.snapshot().log.length).toBe(host.match!.game.log.length);
    expect(c.table!.snapshot().me).toBe(1);
  });

  it('心跳：连接没断但一直收不到消息，房主当作掉线，电脑托管', async () => {
    const { host, clients } = await makeRoom(5, ['甲'], { seed: 4, seatOrder: [0, 1], heartbeat: { every: 5, timeout: 40 } }, 100000);
    const c = clients[0];
    c.setReady(true);
    await waitFor(() => host.canStart());
    host.start();
    const stop = autoPlay(host.hostTable()!);
    await waitFor(() => !!c.table?.ready);
    // 对方「静默」：发出的消息都丢掉（比如网络卡死、页面被系统挂起）
    (c as unknown as { conn: { send(m: unknown): void } }).conn.send = () => {};
    await waitFor(() => host.match!.seats[1]!.away);
    await waitFor(() => !!host.match!.record);
    stop();
  });
});
