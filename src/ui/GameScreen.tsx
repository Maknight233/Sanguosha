import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { BasicAI } from '../ai/basic';
import { isRed } from '../data/cards';
import { generalDef } from '../data/generals';
import { Game, ROLE_NAME, WINNER_NAME } from '../engine/game';
import type { Card, CardPick, GameView, PlayOption, Request, Response, SkillOption, Winner } from '../engine/types';
import { CardView, Equips, GeneralCard, Hp, Modal, SeatView } from './components';
import { HumanController, PacedController } from './controllers';
import { describeRequest, skillName } from './describe';
import { dyingSeats, EffectsLayer, PlayZone } from './effects';

const HUMAN = 0;
const NAMES = ['你', '电脑一', '电脑二', '电脑三', '电脑四'];
const PHASE_NAME: Record<string, string> = {
  setup: '选将',
  prepare: '准备阶段',
  draw: '摸牌阶段',
  play: '出牌阶段',
  discard: '弃牌阶段',
  end: '结束阶段',
  over: '游戏结束',
};
/** 牌桌上的座位位置（从玩家开始逆时针：下、右、右上、左上、左） */
const SEAT_AREA = ['me', 'right', 'top-right', 'top-left', 'left'];

interface Session {
  game: Game;
  human: HumanController;
  ais: PacedController[];
}

function createSession(delay: () => number, seed?: number): Session {
  const human = new HumanController();
  const ais = [1, 2, 3, 4].map(() => new PacedController(new BasicAI(), delay));
  const game = new Game({ controllers: [human, ...ais], names: NAMES, seed: seed ?? Math.floor(Math.random() * 1e9) });
  return { game, human, ais };
}

interface GameScreenProps {
  onExit: () => void;
  /** 测试用：固定 AI 停顿与随机种子 */
  aiDelay?: number;
  seed?: number;
}

export function GameScreen({ onExit, aiDelay, seed }: GameScreenProps) {
  const [round, setRound] = useState(0);
  const [session, setSession] = useState<Session | null>(null);
  const [winner, setWinner] = useState<Winner | null>(null);
  const [speed, setSpeed] = useState(aiDelay ?? 600);
  const speedRef = useRef(speed);
  speedRef.current = speed;
  const [, rerender] = useReducer((x: number) => x + 1, 0);
  const tableRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const s = createSession(() => speedRef.current, seed === undefined ? undefined : seed + round);
    setSession(s);
    setWinner(null);
    const unsubs = [s.game.subscribe(rerender), s.human.subscribe(rerender)];
    s.game.start().then(setWinner, (e) => console.error(e));
    return () => {
      unsubs.forEach((u) => u());
      s.human.cancelled = true;
      s.ais.forEach((a) => (a.cancelled = true));
    };
  }, [round]);

  if (!session) return null;
  const { game, human } = session;
  const view = game.view(HUMAN);
  const pending = human.pending;
  const dying = dyingSeats(game);
  const shortName = (s: number) => {
    const p = view.players[s];
    if (s === HUMAN) return '你';
    return p.general ? generalDef(p.general).name : p.name;
  };

  return (
    <div className="game-layout">
      <div className="table" ref={tableRef}>
        {view.players.map((p) =>
          p.seat === HUMAN ? null : (
            <div key={p.seat} className={`area-${SEAT_AREA[p.seat]}`}>
              <SeatSlot game={game} view={view} seat={p.seat} pending={pending?.req ?? null} />
            </div>
          ),
        )}
        <div className="area-center">
          <div className="center-info">
            <div>第 {view.turn} 回合 · {view.turn > 0 ? `${view.players[view.current].name} 的${PHASE_NAME[view.phase]}` : '选将'}</div>
            <div className="muted">牌堆 {view.drawPileCount} 张 · 弃牌堆 {view.discardPileCount} 张</div>
          </div>
          {dying.map((s) => (
            <div key={s} className="dying-banner">
              {shortName(s)} 濒死，求【药】！
            </div>
          ))}
          <PlayZone game={game} shortName={shortName} />
          <div className="speed">
            AI 速度：
            {[
              ['快', 150],
              ['中', 600],
              ['慢', 1200],
            ].map(([label, ms]) => (
              <button key={label} className={speed === ms ? 'active' : ''} onClick={() => setSpeed(ms as number)}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="area-me">
          <PlayerArea key={pending ? JSON.stringify(pending.req) + game.log.length : "idle"} view={view} human={human} />
        </div>
        <EffectsLayer key={round} game={game} container={tableRef} />
      </div>
      <aside className="side">
        <div className="side-buttons">
          <button onClick={() => setRound((r) => r + 1)}>重新开始</button>
          <button onClick={onExit}>返回菜单</button>
        </div>
        <LogPanel game={game} />
      </aside>
      {winner && <GameOver game={game} winner={winner} onAgain={() => setRound((r) => r + 1)} onExit={onExit} />}
    </div>
  );
}

// ───────────── 选择状态（座位点击需要和手牌区共享）─────────────

interface Selection {
  cards: number[];
  targets: number[];
  option: PlayOption | null;
  skill: SkillOption | null;
}
const EMPTY: Selection = { cards: [], targets: [], option: null, skill: null };

// 简单的模块级共享状态：当前选择 + 订阅者
let selection: Selection = EMPTY;
const selListeners = new Set<() => void>();
function setSelection(s: Selection) {
  selection = s;
  selListeners.forEach((l) => l());
}
function useSelection(): Selection {
  const [, rerender] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    selListeners.add(rerender);
    return () => {
      selListeners.delete(rerender);
    };
  }, []);
  return selection;
}

/** 当前请求下，哪些座位可以被点选 */
function selectableSeats(req: Request | null, sel: Selection): number[] {
  if (!req || req.type !== 'play') return [];
  if (sel.option) {
    const t0 = sel.targets[0];
    if (t0 === undefined) return sel.option.targets;
    return [t0, ...(sel.option.extraTargets?.[t0] ?? [])];
  }
  if (sel.skill) {
    const t0 = sel.targets[0];
    if (t0 === undefined) return sel.skill.targets;
    return sel.skill.skill === 'huoxin' ? [t0, ...(sel.skill.secondTargets?.[t0] ?? [])] : [t0];
  }
  return [];
}

function clickSeat(req: Request | null, sel: Selection, seat: number) {
  if (!req || req.type !== 'play') return;
  const [t0, t1] = sel.targets;
  if (t0 === seat) return setSelection({ ...sel, targets: [] });
  if (t1 === seat) return setSelection({ ...sel, targets: [t0] });
  if (t0 === undefined) return setSelection({ ...sel, targets: [seat] });
  setSelection({ ...sel, targets: [t0, seat] });
}

function SeatSlot({ game, view, seat, pending }: { game: Game; view: GameView; seat: number; pending: Request | null }) {
  const sel = useSelection();
  const selectable = selectableSeats(pending, sel).includes(seat);
  const alive = view.players[HUMAN].alive && view.players[seat].alive;
  return (
    <SeatView
      p={view.players[seat]}
      isCurrent={view.current === seat && view.turn > 0}
      selectable={selectable}
      selected={sel.targets.includes(seat)}
      distance={alive ? game.distance(HUMAN, seat) : null}
      inRange={alive && game.inAttackRange(HUMAN, seat)}
      onClick={() => clickSeat(pending, sel, seat)}
    />
  );
}

// ───────────── 玩家区域：自己的信息、手牌、操作按钮 ─────────────

function PlayerArea({ view, human }: { view: GameView; human: HumanController }) {
  const me = view.players[HUMAN];
  const hand = me.hand ?? [];
  const req = human.pending?.req ?? null;
  const sel = useSelection();

  // 新的请求到来时清空选择
  useEffect(() => setSelection(EMPTY), []);

  const answer = (r: Response<Request>) => {
    setSelection(EMPTY);
    human.answer(r);
  };

  const cardOption = (id: number) => (req?.type === 'play' ? req.options.find((o) => o.cardId === id) : undefined);

  function cardUsable(c: Card): boolean {
    if (!req) return false;
    switch (req.type) {
      case 'play':
        return sel.skill ? true : !!cardOption(c.id);
      case 'respond':
        return req.accept.includes(c.key) || !!req.allowPair;
      case 'discard':
        return true;
      default:
        return false;
    }
  }

  function clickCard(c: Card) {
    if (!req) return;
    const has = sel.cards.includes(c.id);
    const toggle = (limit: number) =>
      setSelection({ ...sel, cards: has ? sel.cards.filter((x) => x !== c.id) : [...sel.cards, c.id].slice(-limit) });
    switch (req.type) {
      case 'play':
        if (sel.skill) return toggle(sel.skill.cardCount);
        if (has) return setSelection(EMPTY);
        return setSelection({ cards: [c.id], targets: [], option: cardOption(c.id) ?? null, skill: null });
      case 'respond':
        return toggle(req.allowPair ? 2 : 1);
      case 'discard':
        return toggle(req.count);
    }
  }

  const picked = sel.cards.map((id) => hand.find((c) => c.id === id)!).filter(Boolean);

  // 确认按钮是否可用
  let canConfirm = false;
  if (req?.type === 'play') {
    if (sel.option) canConfirm = sel.option.targets.length === 0 || sel.targets.length >= 1;
    if (sel.skill) {
      const needTargets = sel.skill.skill === 'huoxin' ? 2 : 1;
      canConfirm = picked.length === sel.skill.cardCount && sel.targets.length === needTargets;
      if (sel.skill.skill === 'huoji') canConfirm &&= picked[0].suit === picked[1].suit;
    }
  } else if (req?.type === 'respond') {
    canConfirm =
      (picked.length === 1 && req.accept.includes(picked[0].key)) ||
      (!!req.allowPair && picked.length === 2 && isRed(picked[0]) === isRed(picked[1]));
  } else if (req?.type === 'discard') {
    canConfirm = picked.length === req.count;
  }

  function confirm() {
    if (!req || !canConfirm) return;
    if (req.type === 'play' && sel.option) {
      const [target, extraTarget] = sel.targets;
      return answer({ type: 'use', cardId: sel.option.cardId, target, extraTarget });
    }
    if (req.type === 'play' && sel.skill) {
      return answer({ type: 'skill', skill: sel.skill.skill, cards: sel.cards, targets: sel.targets });
    }
    if (req.type === 'respond') return answer(picked.length === 2 ? [picked[0].id, picked[1].id] : picked[0].id);
    if (req.type === 'discard') return answer(sel.cards);
  }

  const g = me.general ? generalDef(me.general) : null;
  const hint = req?.type === 'play' ? playHint(sel) : '';

  return (
    <div
      data-seat={HUMAN}
      className={`player-area ${view.current === HUMAN && view.turn > 0 ? 'current' : ''} ${me.alive ? '' : 'dead'} ${me.alive && me.hp <= 0 ? 'dying' : ''}`}
    >
      <div className="me-info">
        <div>
          <b>{g?.name ?? '选将中'}</b>
          {me.role && <span className={`role-badge role-${me.role}`}>{ROLE_NAME[me.role]}</span>}
        </div>
        {g && <Hp hp={Math.max(me.hp, 0)} maxHp={me.maxHp} />}
        <Equips equips={me.equips} />
        {g && (
          <div className="seat-skills">
            {g.skills.map((s) => (
              <div key={s.name} title={s.description}>
                【{s.name}】{s.description}
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="me-main">
        <div className={`prompt ${req?.type === 'respond' && req.reason.kind === 'save' ? 'urgent' : ''}`}>
          {req ? describeRequest(view, req) : me.alive ? '等待其他角色行动……' : '你已阵亡，正在观战……'}
          {hint && <span className="muted"> · {hint}</span>}
        </div>
        <div className="hand">
          {hand.map((c) => (
            <CardView key={c.id} card={c} selected={sel.cards.includes(c.id)} disabled={!cardUsable(c)} onClick={() => clickCard(c)} />
          ))}
          {hand.length === 0 && <span className="muted">（没有手牌）</span>}
        </div>
        <div className="actions">
          {req?.type === 'play' &&
            req.skills.map((s) => (
              <button
                key={s.skill}
                className={sel.skill?.skill === s.skill ? 'active' : ''}
                onClick={() => setSelection(sel.skill?.skill === s.skill ? EMPTY : { cards: [], targets: [], option: null, skill: s })}
              >
                发动【{skillName(s.skill)}】
              </button>
            ))}
          {(req?.type === 'play' || req?.type === 'respond' || req?.type === 'discard') && (
            <button className="primary" disabled={!canConfirm} onClick={confirm}>
              确定
            </button>
          )}
          {req?.type === 'play' && <button onClick={() => answer({ type: 'end' })}>结束出牌</button>}
          {req?.type === 'respond' && <button onClick={() => answer(null)}>不出</button>}
        </div>
      </div>
      {req && <RequestModal key={JSON.stringify(req)} view={view} req={req} answer={answer} />}
    </div>
  );
}

function playHint(sel: Selection): string {
  if (sel.option) {
    if (sel.option.targets.length === 0) return '点击「确定」使用';
    if (sel.targets.length === 0) return '请点击一名目标角色';
    if (sel.option.extraTargets?.[sel.targets[0]]?.length && sel.targets.length === 1) return '可再点击一名相邻角色作为额外目标（镔铁大戟）';
    return '点击「确定」使用';
  }
  if (sel.skill) {
    const parts: string[] = [];
    if (sel.skill.cardCount > 0) parts.push(`选择 ${sel.skill.cardCount} 张手牌${sel.skill.skill === 'huoji' ? '（同花色）' : ''}`);
    parts.push(sel.skill.skill === 'huoxin' ? '依次点击出【斩】者与被【斩】者' : '点击目标角色');
    return parts.join('，');
  }
  return '';
}

// ───────────── 弹窗类请求 ─────────────

function RequestModal({ view, req, answer }: { view: GameView; req: Request; answer: (r: Response<Request>) => void }) {
  const [picked, setPicked] = useState<number[]>([]);
  const toggle = (id: number, limit: number) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id].slice(-limit)));
  const title = describeRequest(view, req);

  switch (req.type) {
    case 'chooseGeneral': {
      const lord = view.players.find((p) => p.role === 'lord')!;
      const amLord = lord.seat === view.me;
      return (
        <Modal title={title}>
          <p>
            你的身份是 <b>{ROLE_NAME[view.players[view.me].role!]}</b>。
            {!amLord && lord.general && `主公选择了【${generalDef(lord.general).name}】。`}
          </p>
          <div className="general-grid">
            {req.options.map((g) => (
              <GeneralCard key={g} general={g} lord={amLord} onClick={() => answer(g)} />
            ))}
          </div>
        </Modal>
      );
    }
    case 'chooseCard':
      return (
        <Modal title={title}>
          <div className="choice-row">
            {req.handCount > 0 && <button onClick={() => answer({ zone: 'hand' } as CardPick)}>随机一张手牌（共 {req.handCount} 张）</button>}
          </div>
          <div className="hand">
            {req.equips.map((c) => (
              <CardView key={c.id} card={c} onClick={() => answer({ zone: 'equip', cardId: c.id } as CardPick)} />
            ))}
          </div>
        </Modal>
      );
    case 'choose':
      return (
        <Modal title={title}>
          <div className="choice-row">
            {req.options.map((o) => (
              <button key={o.id} onClick={() => answer(o.id)}>
                {o.label}
              </button>
            ))}
          </div>
        </Modal>
      );
    case 'selectCards':
      return (
        <Modal title={title}>
          <div className="hand">
            {req.cards.map((c) => (
              <CardView key={c.id} card={c} selected={picked.includes(c.id)} onClick={() => toggle(c.id, req.count)} />
            ))}
          </div>
          <button className="primary" disabled={picked.length !== req.count} onClick={() => answer(picked)}>
            确定
          </button>
        </Modal>
      );
    case 'orderCards':
      return (
        <Modal title={title}>
          <div className="hand">
            {req.cards.map((c) => (
              <div key={c.id} className="order-wrap">
                <CardView card={c} selected={picked.includes(c.id)} onClick={() => toggle(c.id, req.cards.length)} />
                {picked.includes(c.id) && <span className="order-num">{picked.indexOf(c.id) + 1}</span>}
              </div>
            ))}
          </div>
          <button className="primary" disabled={picked.length !== req.cards.length} onClick={() => answer(picked)}>
            确定
          </button>
        </Modal>
      );
    default:
      return null;
  }
}

// ───────────── 日志与结算 ─────────────

function LogPanel({ game }: { game: Game }) {
  const ref = useRef<HTMLDivElement>(null);
  const n = game.log.length;
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [n]);
  const entries = useMemo(() => game.log.slice(-300), [n, game]);
  return (
    <div className="log" ref={ref}>
      {entries.map((e, i) => (
        <div key={n - entries.length + i} className={e.text.startsWith('——') ? 'log-turn' : ''}>
          {e.text}
        </div>
      ))}
    </div>
  );
}

function GameOver({ game, winner, onAgain, onExit }: { game: Game; winner: Winner; onAgain: () => void; onExit: () => void }) {
  const me = game.players[HUMAN];
  const team = (r: string) => (r === 'loyalist' ? 'lord' : r);
  const won = team(me.role) === winner;
  return (
    <Modal title={won ? '胜利！' : '失败'}>
      <p>
        <b>{WINNER_NAME[winner]}</b>获胜，共 {game.turn} 回合。
      </p>
      <table>
        <thead>
          <tr>
            <th>玩家</th>
            <th>武将</th>
            <th>身份</th>
            <th>结果</th>
          </tr>
        </thead>
        <tbody>
          {game.players.map((p) => (
            <tr key={p.seat}>
              <td>{p.name}</td>
              <td>{generalDef(p.general).name}</td>
              <td>{ROLE_NAME[p.role]}</td>
              <td>{p.alive ? `存活（${p.hp}/${p.maxHp}）` : '阵亡'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="choice-row">
        <button className="primary" onClick={onAgain}>
          再来一局
        </button>
        <button onClick={onExit}>返回菜单</button>
      </div>
    </Modal>
  );
}
