import type { ReactNode } from 'react';
import { cardDef, isRed, SUIT_SYMBOL } from '../data/cards';
import { FACTION_NAME, generalDef } from '../data/generals';
import { ROLE_NAME } from '../engine/game';
import type { Card, EquipSlot, PlayerPublic } from '../engine/types';

const RANK_TEXT = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const KIND_NAME = { basic: '基础', trick: '锦囊', equip: '装备' } as const;

interface CardViewProps {
  card: Card;
  selected?: boolean;
  disabled?: boolean;
  small?: boolean;
  onClick?: () => void;
}

/** 卡牌：文字 + CSS 卡面，预留图片位置（CardDef.image） */
export function CardView({ card, selected, disabled, small, onClick }: CardViewProps) {
  const def = cardDef(card.key);
  const cls = ['card', `card-${def.kind}`, selected && 'selected', disabled && 'disabled', small && 'small', onClick && !disabled && 'clickable']
    .filter(Boolean)
    .join(' ');
  return (
    <div className={cls} title={`【${def.name}】${def.description}`} onClick={disabled ? undefined : onClick}>
      <div className={`card-corner ${isRed(card) ? 'red' : 'black'}`}>
        {SUIT_SYMBOL[card.suit]}
        {RANK_TEXT[card.rank]}
      </div>
      <div className="card-art">{def.image ? <img src={def.image} alt={def.name} /> : <span className="card-name">{def.name}</span>}</div>
      <div className="card-kind">{KIND_NAME[def.kind]}</div>
    </div>
  );
}

export function GeneralCard({ general, selected, onClick, lord }: { general: string; selected?: boolean; onClick?: () => void; lord?: boolean }) {
  const g = generalDef(general);
  return (
    <div className={`general-card faction-${g.faction} ${selected ? 'selected' : ''} ${onClick ? 'clickable' : ''}`} onClick={onClick}>
      <div className="general-portrait">{g.image ? <img src={g.image} alt={g.name} /> : <span>{g.name}</span>}</div>
      <div className="general-head">
        <span className="faction-tag">{FACTION_NAME[g.faction]}</span>
        <b>{g.name}</b>
        <Hp hp={g.hp + (lord ? 1 : 0)} maxHp={g.hp + (lord ? 1 : 0)} />
      </div>
      {g.skills.map((s) => (
        <p key={s.name} className="skill-text">
          <b>【{s.name}】</b>
          {s.lordSkill && !lord ? <span className="muted">（仅主公）</span> : null}
          {s.description}
        </p>
      ))}
    </div>
  );
}

export function Hp({ hp, maxHp }: { hp: number; maxHp: number }) {
  return (
    <span className="hp" title={`体力 ${hp}/${maxHp}`}>
      {Array.from({ length: maxHp }, (_, i) => (
        <span key={i} className={i < hp ? 'hp-full' : 'hp-empty'}>
          ♥
        </span>
      ))}
    </span>
  );
}

const SLOT_ORDER: EquipSlot[] = ['weapon', 'armor', 'horseMinus', 'horsePlus'];
const SLOT_NAME: Record<EquipSlot, string> = { weapon: '武器', armor: '防具', horseMinus: '-1马', horsePlus: '+1马' };

export function Equips({ equips }: { equips: PlayerPublic['equips'] }) {
  const list = SLOT_ORDER.filter((s) => equips[s]);
  if (list.length === 0) return <div className="equips muted">无装备</div>;
  return (
    <div className="equips">
      {list.map((s) => {
        const c = equips[s]!;
        const def = cardDef(c.key);
        return (
          <span key={s} className="equip-tag" title={def.description}>
            {SLOT_NAME[s]}：{def.name}
          </span>
        );
      })}
    </div>
  );
}

interface SeatProps {
  p: PlayerPublic;
  isCurrent: boolean;
  selectable: boolean;
  selected: boolean;
  distance: number | null;
  inRange: boolean;
  onClick: () => void;
}

export function SeatView({ p, isCurrent, selectable, selected, distance, inRange, onClick }: SeatProps) {
  const g = p.general ? generalDef(p.general) : null;
  const cls = ['seat', g && `faction-${g.faction}`, isCurrent && 'current', !p.alive && 'dead', selectable && 'selectable', selected && 'selected']
    .filter(Boolean)
    .join(' ');
  return (
    <div className={cls} onClick={selectable ? onClick : undefined}>
      <div className="seat-top">
        <span className="seat-name">{p.name}</span>
        <span className={`role-badge role-${p.role ?? 'unknown'}`}>{p.role ? ROLE_NAME[p.role] : '？'}</span>
      </div>
      <div className="general-portrait small">
        {g?.image ? <img src={g.image} alt={g.name} /> : <span>{g?.name ?? '选将中'}</span>}
      </div>
      {g && (
        <div className="seat-info">
          <span className="faction-tag">{FACTION_NAME[g.faction]}</span>
          <Hp hp={Math.max(p.hp, 0)} maxHp={p.maxHp} />
        </div>
      )}
      <div className="seat-info">
        <span>手牌 {p.handCount}</span>
        {distance !== null && p.alive && (
          <span className={inRange ? 'in-range' : 'muted'}>
            距离 {distance}
            {inRange ? '·可攻击' : ''}
          </span>
        )}
      </div>
      <Equips equips={p.equips} />
      {g && (
        <div className="seat-skills" title={g.skills.map((s) => `【${s.name}】${s.description}`).join('\n')}>
          {g.skills.map((s) => `【${s.name}】`).join('')}
        </div>
      )}
      {!p.alive && <div className="dead-mark">阵亡</div>}
    </div>
  );
}

export function Modal({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h3>{title}</h3>
        {children}
      </div>
    </div>
  );
}
