/** 联机：建房 / 加入、房间界面、对局 */
import { useEffect, useMemo, useReducer, useState, type ReactNode } from 'react';
import { AI_LEVEL_NAME, type AiLevel } from '../ai/basic';
import { DUEL_PLAYERS, PLAYER_COUNTS, TEAM_PLAYERS } from '../engine/game';
import { ClientRoom } from '../net/client';
import { cleanName, HostRoom } from '../net/host';
import { TIMER_MS, TIMER_NAME, type LobbyState, type RoomSettings, type SharedRecord, type TimerPreset } from '../net/protocol';
import { onlineRecord } from '../net/record';
import { normalizeRoomId, type Transport } from '../net/transport';
import { roleSummary } from './App';
import { Modal } from './components';
import { TableScreen } from './GameScreen';
import { loadLevel, loadOnlineName, loadPlayers, loadRecords, onlineToken, saveGame, saveOnlineName } from './storage';
import type { TableClient, TableSnapshot } from './table';

/** 房间号放在链接里：…/?room=ABC123 */
export function roomFromUrl(): string {
  try {
    return normalizeRoomId(new URLSearchParams(location.search).get('room') ?? '');
  } catch {
    return '';
  }
}

export function inviteLink(roomId: string): string {
  return `${location.origin}${location.pathname}?room=${roomId}`;
}

/** 离开联机后把链接里的房间号去掉，免得刷新又进去 */
function clearRoomFromUrl() {
  try {
    if (!location.search.includes('room=')) return;
    history.replaceState(null, '', location.pathname);
  } catch {
    /* 忽略 */
  }
}

const MODE_NAME = (n: number) => (n === DUEL_PLAYERS ? '1v1' : n === TEAM_PLAYERS ? '2v2' : `${n} 人身份局`);

let peerTransport: Transport | null = null;
async function defaultTransport(): Promise<Transport> {
  if (!peerTransport) {
    const { PeerTransport } = await import('../net/peer');
    peerTransport = new PeerTransport();
  }
  return peerTransport;
}

type Conn = { kind: 'host'; room: HostRoom } | { kind: 'client'; room: ClientRoom };

interface OnlineScreenProps {
  onExit: () => void;
  /** 测试用：替换连接层 */
  transport?: Transport;
  /** 链接里带的房间号 */
  initialRoom?: string;
}

export function OnlineScreen({ onExit, transport, initialRoom = '' }: OnlineScreenProps) {
  const [conn, setConn] = useState<Conn | null>(null);
  const [, rerender] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    if (!conn) return;
    const unsub = conn.room.subscribe(rerender);
    // 连上到订阅之间可能已经收到消息，补一次刷新
    rerender();
    return unsub;
  }, [conn]);
  const close = (c: Conn) => (c.kind === 'host' ? c.room.close() : c.room.leave());
  // 关掉页面时关闭房间 / 离开（刷新页面的人可以用同一个链接回到座位）
  useEffect(() => {
    if (!conn) return;
    const onHide = () => close(conn);
    window.addEventListener('pagehide', onHide);
    return () => window.removeEventListener('pagehide', onHide);
  }, [conn]);

  const exit = () => {
    if (conn) close(conn);
    clearRoomFromUrl();
    setConn(null);
    onExit();
  };

  if (!conn) return <EntryScreen transport={transport} initialRoom={initialRoom} onConnected={setConn} onExit={exit} />;
  if (conn.kind === 'host') return <HostView room={conn.room} onExit={exit} />;
  return <ClientView room={conn.room} onExit={exit} />;
}

// ───────────── 入口：昵称、建房、加入 ─────────────

function EntryScreen({
  transport,
  initialRoom,
  onConnected,
  onExit,
}: {
  transport?: Transport;
  initialRoom: string;
  onConnected: (c: Conn) => void;
  onExit: () => void;
}) {
  const [name, setName] = useState(loadOnlineName);
  const [code, setCode] = useState(initialRoom);
  const [busy, setBusy] = useState<'host' | 'join' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const nick = cleanName(name);

  const run = async (kind: 'host' | 'join') => {
    if (!nick) return setError('先填一个昵称');
    saveOnlineName(nick);
    setBusy(kind);
    setError(null);
    try {
      const t = transport ?? (await defaultTransport());
      if (kind === 'host') {
        const ep = await t.host();
        const p = loadPlayers();
        const settings: RoomSettings = { players: p, level: loadLevel(), timer: 'none' };
        onConnected({ kind: 'host', room: new HostRoom(ep, nick, settings) });
      } else {
        const id = normalizeRoomId(code);
        if (!id) throw new Error('请输入房间号');
        const room = new ClientRoom(t, id, nick, onlineToken(id));
        await room.connect();
        onConnected({ kind: 'client', room });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(null);
    }
  };

  return (
    <main className="menu online">
      <h1>联机对战</h1>
      <p className="muted">和朋友开房间一起玩：一人建房，把房间号或邀请链接发给朋友；空位由电脑补上。</p>
      <div className="online-form">
        <label>
          昵称
          <input value={name} maxLength={12} placeholder="最多 8 个字" onChange={(e) => setName(e.target.value)} aria-label="昵称" />
        </label>
        <div className="online-actions">
          <button className="primary big" disabled={!!busy} onClick={() => void run('host')}>
            {busy === 'host' ? '正在建房…' : '创建房间'}
          </button>
          <div className="online-join">
            <input
              value={code}
              maxLength={8}
              placeholder="房间号"
              aria-label="房间号"
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && void run('join')}
            />
            <button className={initialRoom ? 'primary' : ''} disabled={!!busy || !normalizeRoomId(code)} onClick={() => void run('join')}>
              {busy === 'join' ? '正在加入…' : '加入房间'}
            </button>
          </div>
        </div>
        {error && <p className="online-error">{error}</p>}
        <p className="muted small">
          连接方式：浏览器之间直连（点对点）。个别网络（公司网、部分手机流量）可能连不上，可以换个网络或用手机热点再试。
        </p>
      </div>
      <button onClick={onExit}>返回菜单</button>
    </main>
  );
}

// ───────────── 房间（房主和其他人共用的显示）─────────────

function Lobby({
  lobby,
  you,
  editable,
  onSettings,
  footer,
}: {
  lobby: LobbyState;
  you: string | null;
  editable: boolean;
  onSettings?: (s: Partial<RoomSettings>) => void;
  footer: ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  const { settings, members } = lobby;
  const link = inviteLink(lobby.roomId);
  const copy = () => {
    navigator.clipboard?.writeText(link).then(
      () => setCopied(true),
      () => setCopied(false),
    );
  };
  const counts = [...PLAYER_COUNTS, DUEL_PLAYERS, TEAM_PLAYERS];
  const ai = settings.players - members.length;
  return (
    <main className="menu online">
      <h1>联机房间</h1>
      <div className="room-code">
        房间号 <b data-testid="room-code">{lobby.roomId}</b>
        <button onClick={copy}>{copied ? '已复制' : '复制邀请链接'}</button>
      </div>
      <p className="muted small room-link">{link}</p>
      <div className="online-panel">
        <h3>
          玩家（{members.length}/{settings.players}）
        </h3>
        <ul className="member-list">
          {members.map((m) => (
            <li key={m.id} className={m.online ? '' : 'offline'}>
              <span>
                {m.name}
                {m.id === you && <span className="muted">（你）</span>}
              </span>
              <span className={`member-tag ${m.host ? 'host' : m.ready ? 'ready' : ''}`}>{m.host ? '房主' : !m.online ? '掉线' : m.ready ? '已准备' : '未准备'}</span>
            </li>
          ))}
          {ai > 0 && <li className="muted">其余 {ai} 个座位由电脑补上</li>}
        </ul>
      </div>
      <div className="online-panel">
        <h3>设置</h3>
        <div className="level-pick">
          模式：
          {counts.map((n) => (
            <button
              key={n}
              className={settings.players === n ? 'active' : ''}
              disabled={!editable || n < members.length}
              onClick={() => onSettings?.({ players: n })}
            >
              {n === DUEL_PLAYERS ? '1v1' : n === TEAM_PLAYERS ? '2v2' : `${n} 人`}
            </button>
          ))}
          <div className="muted level-note">{roleSummary(settings.players)}</div>
        </div>
        <div className="level-pick">
          电脑难度：
          {(Object.keys(AI_LEVEL_NAME) as AiLevel[]).map((l) => (
            <button key={l} className={settings.level === l ? 'active' : ''} disabled={!editable} onClick={() => onSettings?.({ level: l })}>
              {AI_LEVEL_NAME[l]}
            </button>
          ))}
        </div>
        <div className="level-pick">
          限时：
          {(Object.keys(TIMER_NAME) as TimerPreset[]).map((t) => (
            <button key={t} className={settings.timer === t ? 'active' : ''} disabled={!editable} onClick={() => onSettings?.({ timer: t })}>
              {TIMER_NAME[t]}
            </button>
          ))}
          <div className="muted level-note">{timerNote(settings.timer)}</div>
        </div>
        {!editable && <p className="muted small">设置由房主决定。</p>}
      </div>
      {footer}
    </main>
  );
}

function timerNote(t: TimerPreset): string {
  const ms = TIMER_MS[t];
  if (!ms) return '不限时：慢慢打。掉线的人由电脑托管，重新打开链接可以回到座位。';
  return `出牌阶段 ${ms.play / 1000} 秒，其他操作 ${ms.other / 1000} 秒；超时由电脑替你操作这一次。掉线的人由电脑托管。`;
}

/** 对局结束后存进「对局记录」并计入战绩（同一局只存一次） */
function useSaveRecord(shared: SharedRecord | null | undefined, seat: number) {
  useEffect(() => {
    if (!shared || seat < 0) return;
    const rec = onlineRecord(shared, seat);
    if (loadRecords().some((r) => r.id === rec.id)) return;
    saveGame(rec);
  }, [shared, seat]);
}

// ───────────── 房主 ─────────────

function HostView({ room, onExit }: { room: HostRoom; onExit: () => void }) {
  const match = room.match;
  // 每局一个牌桌对象
  const table = useMemo(() => room.hostTable(), [match]);
  useSaveRecord(match?.record, match ? match.seatOf(room.hostMember.id) : -1);
  if (match && table) {
    return (
      <OnlineTable
        snapLabel={MODE_NAME(room.settings.players)}
        table={table}
        exitLabel="关闭房间"
        onExit={onExit}
        againLabel="回到房间"
        onAgain={() => room.backToLobby()}
        names={room.lobby()}
      />
    );
  }
  const lobby = room.lobby();
  const waiting = lobby.members.filter((m) => !m.ready).map((m) => m.name);
  return (
    <Lobby
      lobby={lobby}
      you={room.hostMember.id}
      editable
      onSettings={(s) => room.setSettings(s)}
      footer={
        <div className="menu-buttons">
          <button className="primary big" disabled={!room.canStart()} onClick={() => room.start()}>
            开始游戏
          </button>
          {waiting.length > 0 && <p className="muted small">等待 {waiting.join('、')} 准备</p>}
          <button onClick={onExit}>关闭房间</button>
        </div>
      }
    />
  );
}

// ───────────── 加入者 ─────────────

function ClientView({ room, onExit }: { room: ClientRoom; onExit: () => void }) {
  const { lobby, table, status } = room;
  useSaveRecord(room.record, table?.ready ? table.snapshot().me : -1);
  const overlay =
    status === 'reconnecting' ? (
      <Modal title="连接断开">
        <p>正在重新连接房主…</p>
        <p className="muted">期间由电脑替你操作，连上后自动回到座位。</p>
        <div className="choice-row">
          <button onClick={onExit}>离开</button>
        </div>
      </Modal>
    ) : status === 'ended' ? (
      <Modal title="已离开房间">
        <p>{room.error ?? '连接已断开。'}</p>
        <div className="choice-row">
          <button className="primary" onClick={onExit}>
            返回菜单
          </button>
        </div>
      </Modal>
    ) : null;

  if (table?.ready) {
    return (
      <>
        <OnlineTable
          snapLabel={lobby ? MODE_NAME(lobby.settings.players) : '联机'}
          table={table}
          exitLabel="离开房间"
          onExit={onExit}
          againLabel="回到房间"
          onAgain={() => room.leaveTable()}
          names={lobby}
        />
        {overlay}
      </>
    );
  }
  if (!lobby) {
    return (
      <main className="menu online">
        <p>正在进入房间 {room.roomId}…</p>
        <button onClick={onExit}>取消</button>
        {overlay}
      </main>
    );
  }
  const me = lobby.members.find((m) => m.id === room.you);
  return (
    <>
      <Lobby
        lobby={lobby}
        you={room.you}
        editable={false}
        footer={
          <div className="menu-buttons">
            {lobby.playing ? (
              <p className="muted">上一局还在结算，等房主回到房间…</p>
            ) : (
              <button className={`big ${me?.ready ? '' : 'primary'}`} onClick={() => room.setReady(!me?.ready)}>
                {me?.ready ? '取消准备' : '准备'}
              </button>
            )}
            <button onClick={onExit}>离开房间</button>
          </div>
        }
      />
      {overlay}
    </>
  );
}

// ───────────── 对局中 ─────────────

function OnlineTable({
  table,
  snapLabel,
  exitLabel,
  onExit,
  againLabel,
  onAgain,
  names,
}: {
  table: TableClient;
  snapLabel: string;
  exitLabel: string;
  onExit: () => void;
  againLabel: string;
  onAgain: () => void;
  names: LobbyState | null;
}) {
  const [confirmExit, setConfirmExit] = useState(false);
  return (
    <>
      <TableScreen
        table={table}
        label={`联机 · ${snapLabel}`}
        sideButtons={<button onClick={() => setConfirmExit(true)}>{exitLabel}</button>}
        centerExtra={<OnlineStatus table={table} names={names} />}
        onAgain={onAgain}
        againLabel={againLabel}
        onExit={onExit}
      />
      {confirmExit && (
        <Modal title={exitLabel} onClose={() => setConfirmExit(false)}>
          <p>{exitLabel === '关闭房间' ? '关闭后对局结束，所有人都会离开房间。' : '离开后由电脑替你打完这一局；用邀请链接重新进来可以回到座位。'}</p>
          <div className="choice-row">
            <button className="primary" onClick={onExit}>
              确定{exitLabel}
            </button>
            <button onClick={() => setConfirmExit(false)}>继续打</button>
          </div>
        </Modal>
      )}
    </>
  );
}

/** 中央信息栏：我的倒计时、掉线托管的人 */
function OnlineStatus({ table, names }: { table: TableClient; names: LobbyState | null }) {
  const snap: TableSnapshot = table.snapshot();
  const deadline = snap.online?.deadline ?? null;
  const [, tick] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    if (deadline === null) return;
    const t = setInterval(tick, 250);
    return () => clearInterval(t);
  }, [deadline]);
  const away = (snap.online?.seats ?? []).flatMap((s, seat) => (s.away ? [snap.view.players[seat]?.name ?? names?.members.find((m) => m.id === s.member)?.name ?? '?'] : []));
  const left = deadline === null ? null : Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
  if (left === null && away.length === 0) return null;
  return (
    <div className="online-status">
      {left !== null && snap.pending && !snap.over && (
        <span className={`countdown ${left <= 5 ? 'urgent' : ''}`} role="timer">
          ⏱ {left} 秒
        </span>
      )}
      {away.length > 0 && <span className="away-note">{away.join('、')} 掉线，电脑托管中</span>}
    </div>
  );
}
