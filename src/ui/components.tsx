import type { ReactNode } from 'react';
import { cardDef, isRed, SUIT_SYMBOL } from '../data/cards';
import { FACTION_NAME, generalDef } from '../data/generals';
import { DUEL_BANNED, isTeam, TEAM_BANNED, roleLabel, YINREN_TEXT } from '../engine/game';
import type { Card, EquipSlot, PlayerPublic, Role } from '../engine/types';
import { CardTip, SkillTip, tipProps } from './tooltip';
import { CardArt, GeneralArt, hasCardArt, hasGeneralArt } from './art';

/** 身份标签的样式：2v2 同队同色（甲队用主公色、乙队用反贼色） */
export function roleBadgeClass(role: Role | null, players: number): string {
  return `role-badge role-${isTeam(players) && role === 'loyalist' ? 'lord' : role ?? 'unknown'}`;
}

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
      <div className="card-art">
        {def.image ? (
          <img src={def.image} alt={def.name} />
        ) : hasCardArt(def.key) ? (
          <CardArt cardKey={def.key} name={def.name} kind={def.kind} />
        ) : (
          <span className="card-name">{def.name}</span>
        )}
      </div>
      <div className="card-kind">{KIND_NAME[def.kind]}</div>
      {hotkey && !disabled && <span className="hotkey">{hotkey}</span>}
    </div>
  );
}

/** 武将头像：有图片用图片，否则用程序生成的水墨头像 */
function Portrait({ g }: { g: ReturnType<typeof generalDef> }) {
  if (g.image) return <img src={g.image} alt={g.name} />;
  if (hasGeneralArt(g.key)) return <GeneralArt general={g.key} name={g.name} faction={g.faction} />;
  return <span>{g.name}</span>;
}

export function GeneralCard({
  general,
  selected,
  onClick,
  lord,
  hotkey,
  duelNote,
}: {
  general: string;
  /** 规则页：标注 1v1 / 2v2 不可选 */
  duelNote?: boolean;
  selected?: boolean;
  onClick?: () => void;
  lord?: boolean;
  hotkey?: string;
}) {
  const g = generalDef(general);
  return (
    <div className={`general-card faction-${g.faction} ${selected ? 'selected' : ''} ${onClick ? 'clickable' : ''}`} onClick={onClick}>
      {hotkey && <span className="hotkey">{hotkey}</span>}
      <div className="general-portrait">
        <Portrait g={g} />
      </div>
      <div className="general-head">
        <span className="faction-tag">{FACTION_NAME[g.faction]}</span>
        <b>{g.name}</b>
        <Hp hp={g.hp + (lord ? 1 : 0)} maxHp={g.hp + (lord ? 1 : 0)} />
        {duelNote && (DUEL_BANNED.has(general) || TEAM_BANNED.has(general)) && (
          <span className="muted duel-note">{[DUEL_BANNED.has(general) && '1v1', TEAM_BANNED.has(general) && '2v2'].filter(Boolean).join('、')} 不可选</span>
        )}
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
            <span className="equip-slot">{SLOT_NAME[s]}：</span>
            {def.name}
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
        <span key={j.card.id} className="judge-tag" {...tipProps(() => <CardTip card={j.as ? { ...j.card, key: j.as } : j.card} />)}>
          判定：{cardDef(j.as ?? j.card.key).name}
          {j.as && '（渡江）'}
        </span>
      ))}
    </div>
  );
}

interface SeatProps {
  p: PlayerPublic;
  /** 人数（1v1 显示先手 / 后手，2v2 显示甲队 / 乙队） */
  players?: number;
  isCurrent: boolean;
  selectable: boolean;
  selected: boolean;
  distance: number | null;
  inRange: boolean;
  onClick: () => void;
  /** 打开武将详情 */
  onInfo?: () => void;
  /** 座位下方的附加内容（「读局」推测） */
  extra?: ReactNode;
}

export function SeatView({ p, players = 5, isCurrent, selectable, selected, distance, inRange, onClick, onInfo, extra }: SeatProps) {
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
          <span className={roleBadgeClass(p.role, players)}>{p.role ? roleLabel(p.role, players) : '？'}</span>
          {onInfo && <InfoButton onClick={onInfo} />}
        </span>
      </div>
      <div className="general-portrait small">
        {g ? <Portrait g={g} /> : <span>选将中</span>}
        {/* 小屏时头像缩成竖排名牌（见 style.css 手机适配） */}
        {g && <span className="portrait-name">{g.name}</span>}
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
            {inRange && <span className="range-word">·可攻击</span>}
          </span>
        )}
      </div>
      <Equips equips={p.equips} />
      <JudgeZone judge={p.judge} />
      {extra}
      {(p.shielded || p.yinren || !!p.empower) && (
        <div className="seat-status">
          {p.shielded && <span className="status-tag shield" {...tipProps(() => <SkillTip name="隐忍" description={YINREN_TEXT} />)}>隐忍·免伤至其回合开始</span>}
          {!!p.empower && <span className="status-tag shield" {...tipProps(() => <SkillTip name="隐忍" description={YINREN_TEXT} />)}>隐忍·强化剩余 {p.empower} 张</span>}
          {p.yinren && <span className="status-tag" {...tipProps(() => <SkillTip name="隐忍" description={YINREN_TEXT} />)}>【隐忍】未发动</span>}
        </div>
      )}
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

/** 小屏（手机横屏）时侧栏收成抽屉，这个按钮负责开关；大屏下不显示 */
export function SideToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <>
      {open && <div className="side-scrim" onClick={onToggle} />}
      <button className="side-toggle" aria-label="菜单" aria-expanded={open} onClick={onToggle}>
        {open ? '×' : '☰'}
      </button>
    </>
  );
}

/** 手机竖屏时盖住牌桌的提示：牌桌只做了横屏布局。能锁定方向的浏览器（安卓）给一个一键全屏横屏的按钮 */
export function RotateHint({ onExit }: { onExit?: () => void }) {
  const canLock =
    typeof document !== 'undefined' &&
    typeof document.documentElement.requestFullscreen === 'function' &&
    typeof screen !== 'undefined' &&
    typeof (screen.orientation as { lock?: unknown } | undefined)?.lock === 'function';
  const goLandscape = async () => {
    try {
      await document.documentElement.requestFullscreen();
      await (screen.orientation as unknown as { lock: (o: string) => Promise<void> }).lock('landscape');
    } catch {
      // 浏览器不允许时保持提示，让玩家手动横屏
    }
  };
  return (
    <div className="rotate-hint" role="note">
      <div className="rotate-icon">⟳</div>
      <b>请把手机横过来</b>
      <div className="muted">牌桌是横向布局。如果转不过来，请先关闭系统的屏幕方向锁定。</div>
      {canLock && (
        <button className="primary" onClick={goLandscape}>
          全屏并横屏
        </button>
      )}
      {onExit && <button onClick={onExit}>先不玩了</button>}
    </div>
  );
}
