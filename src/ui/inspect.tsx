import { cardDef } from '../data/cards';
import { FACTION_NAME, generalDef } from '../data/generals';
import { isVersus, roleLabel } from '../engine/game';
import type { EquipSlot, LogEntry, LogEvent, PlayerPublic } from '../engine/types';
import { CardView, Hp, Modal, roleBadgeClass } from './components';

const SLOT_ORDER: EquipSlot[] = ['weapon', 'armor', 'horseMinus', 'horsePlus'];
const SLOT_NAME: Record<EquipSlot, string> = { weapon: '武器', armor: '防具', horseMinus: '-1马', horsePlus: '+1马' };

/** 武将详情面板 */
export function GeneralPanel({ p, players = 5, isMe, paused, onClose }: { p: PlayerPublic; players?: number; isMe: boolean; paused: boolean; onClose: () => void }) {
  const g = p.general ? generalDef(p.general) : null;
  const isLord = p.role === 'lord' && !isVersus(players);
  const equips = SLOT_ORDER.filter((s) => p.equips[s]);
  return (
    <Modal title={`${p.name}${g ? ` · ${g.name}` : ''}`} onClose={onClose}>
      <div className={`inspect ${g ? `faction-${g.faction}` : ''}`}>
        {paused && <div className="paused-tag">游戏已暂停，关闭面板后继续</div>}
        {!g ? (
          <p className="muted">尚未选择武将。</p>
        ) : (
          <>
            <div className="inspect-head">
              <span className="faction-tag">{FACTION_NAME[g.faction]}</span>
              <Hp hp={Math.max(p.hp, 0)} maxHp={p.maxHp} />
              <span>
                体力 {Math.max(p.hp, 0)}/{p.maxHp}
              </span>
              <span>手牌 {p.handCount} 张</span>
              <span>
                身份：
                <span className={roleBadgeClass(p.role, players)}>{p.role ? roleLabel(p.role, players) : '未知'}</span>
              </span>
              {!p.alive && <b className="red">已阵亡</b>}
            </div>
            <h4>技能</h4>
            {g.skills.map((s) => (
              <p key={s.name} className="skill-text">
                <b>【{s.name}】</b>
                {s.lordSkill && <span className="muted">（主公技{isLord ? '' : '，未生效'}）</span>}
                {s.description}
              </p>
            ))}
          </>
        )}
        <h4>装备</h4>
        {equips.length === 0 ? (
          <p className="muted">无装备</p>
        ) : (
          equips.map((s) => {
            const c = p.equips[s]!;
            return (
              <div key={s} className="inspect-equip">
                <CardView card={c} small />
                <div>
                  <b>
                    {SLOT_NAME[s]}：【{cardDef(c.key).name}】
                  </b>
                  <div>{cardDef(c.key).description}</div>
                </div>
              </div>
            );
          })
        )}
        {p.judge.length > 0 && (
          <>
            <h4>判定区</h4>
            {p.judge.map((j) => (
              <div key={j.card.id} className="inspect-equip">
                <CardView card={j.card} small />
                <div>
                  <b>
                    【{cardDef(j.as ?? j.card.key).name}】{j.as && `（渡江：${cardDef(j.card.key).name}）`}
                  </b>
                  <div>{cardDef(j.as ?? j.card.key).description}</div>
                </div>
              </div>
            ))}
          </>
        )}
        {isMe && <p className="muted">这是你自己的武将。</p>}
      </div>
    </Modal>
  );
}

// ───────────── 日志筛选 ─────────────

export type LogFilter = 'all' | 'mine' | 'turn';
export const LOG_FILTERS: Array<[LogFilter, string]> = [
  ['all', '全部'],
  ['mine', '与我相关'],
  ['turn', '本回合'],
];

/** 事件涉及的座位 */
function eventSeats(ev: LogEvent): number[] {
  switch (ev.type) {
    case 'use':
      return [ev.from, ...ev.to];
    case 'discard':
      return [ev.from];
    case 'pindian':
      return [ev.from, ev.to];
    case 'damage':
      return ev.from === null ? [ev.seat] : [ev.seat, ev.from];
    default:
      return [ev.seat];
  }
}

const isTurnHeader = (e: LogEntry) => e.text.startsWith('——');

/** 按筛选条件过滤日志；「与我相关」中，有相关条目的回合保留回合标题行，便于分隔 */
export function filterLog(log: LogEntry[], filter: LogFilter, me: number, turn: number): LogEntry[] {
  if (filter === 'turn') return log.filter((e) => e.turn === turn);
  if (filter === 'mine') {
    const relevant = (e: LogEntry) => e.text.includes('你') || (!!e.event && eventSeats(e.event).includes(me));
    const turns = new Set(log.filter((e) => !isTurnHeader(e) && relevant(e)).map((e) => e.turn));
    return log.filter((e) => (isTurnHeader(e) ? turns.has(e.turn) : relevant(e)));
  }
  return log;
}
