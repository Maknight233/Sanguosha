import type { ReactNode } from 'react';
import { cardDef, isRed, SUIT_SYMBOL } from '../data/cards';
import { FACTION_NAME, generalDef } from '../data/generals';
import { ROLE_NAME } from '../engine/game';
import type { Card, EquipSlot, PlayerPublic } from '../engine/types';
import { CardTip, SkillTip, tipProps } from './tooltip';

const RANK_TEXT = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const KIND_NAME = { basic: '基础', trick: '锦囊', equip: '装备' } as const;

interface CardViewProps {
  card: Card;
  selected?: boolean;
  disabled?: boolean;
  small?: boolean;
  /** 快捷键提示（显示在右下角） */
  hotkey?: string;
  onClick?: () => void;
}

/** 卡牌：文字 + CSS 卡面，预留图片位置（CardDef.image） */
export function CardView({ card, selected, disabled, small, hotkey, onClick }: CardViewProps) {
  const def = cardDef(card.key);
  const cls = ['card', `card-${def.kind}`, selected && 'selected', disabled && 'disabled', small && 'small', onClick && !disabled && 'clickable']
    .filter(Boolean)
    .join(' ');
  return (
    <div className={cls} data-card={def.name} {...tipProps(() => <CardTip card={card} />)} onClick={disabled ? undefined : onClick}>
      <div className={`card-corner ${isRed(card) ? 'red' : 'black'}`}>
        {SUIT_SYMBOL[card.suit]}
        {RANK_TEXT[card.rank]}
      </div>
      <div className="card-art">{def.image ? <img src={def.image} alt={def.name} /> : <span className="card-name">{def.name}</span>}</div>
      <div className="card-kind">{KIND_NAME[def.kind]}</div>
      {hotkey && !disabled && <span className="hotkey">{hotkey}</span>}
    </div>
  );
}

export function GeneralCard({
  general,
  selected,
  onClick,
  lord,
  hotkey,
}: {
  general: string;
  selected?: boolean;
  onClick?: () => void;
  lord?: boolean;
  hotkey?: string;
}) {
  const g = generalDef(general);
  return (
    <div className={`general-card faction-${g.faction} ${selected ? 'selected' : ''} ${onClick ? 'clickable' : ''}`} onClick={onClick}>
      {hotkey && <span className="hotkey">{hotkey}</span>}
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
          <span key={s} className="equip-tag" {...tipProps(() => <CardTip card={c} />)}>
            {SLOT_NAME[s]}：{def.name}
          </span>
        );
      })}
    </div>
  );
}

/** 判定区：延时锦囊（带悬浮说明） */
export function JudgeZone({ judge }: { judge: PlayerPublic['judge'] }) {
  if (judge.length === 0) return null;
  return (
    <div className="judge-zone">
      {judge.map((j) => (
        <span key={j.card.id} className="judge-tag" {...tipProps(() => <CardTip card={j.card} />)}>
          判定：{cardDef(j.card.key).name}
        </span>
      ))}
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
  /** 打开武将详情 */
  onInfo?: () => void;
}

export function SeatView({ p, isCurrent, selectable, selected, distance, inRange, onClick, onInfo }: SeatProps) {
  const g = p.general ? generalDef(p.general) : null;
  const dying = p.alive && p.hp <= 0;
  const cls = ['seat', g && `faction-${g.faction}`, isCurrent && 'current', !p.alive && 'dead', dying && 'dying', selectable && 'selectable', selected && 'selected']
    .filter(Boolean)
    .join(' ');
  return (
    <div className={cls} data-seat={p.seat} onClick={selectable ? onClick : undefined}>
      <div className="seat-top">
        <span className="seat-name">{p.name}</span>
        <span>
          <span className={`role-badge role-${p.role ?? 'unknown'}`}>{p.role ? ROLE_NAME[p.role] : '？'}</span>
          {onInfo && <InfoButton onClick={onInfo} />}
        </span>
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
      <JudgeZone judge={p.judge} />
      {g && (
        <div className="seat-skills">
          {g.skills.map((s) => (
            <span key={s.name} className="skill-name" {...tipProps(() => <SkillTip {...s} />)}>
              【{s.name}】
            </span>
          ))}
        </div>
      )}
      {!p.alive && <div className="dead-mark">阵亡</div>}
    </div>
  );
}

/** 「ⓘ」详情按钮；不会触发外层座位的点击（选目标） */
export function InfoButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      className="info-btn"
      aria-label="武将详情"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      ⓘ
    </button>
  );
}

export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose?: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        {onClose && (
          <button className="modal-close" aria-label="关闭" onClick={onClose}>
            ×
          </button>
        )}
        <h3>{title}</h3>
        {children}
      </div>
    </div>
  );
}
