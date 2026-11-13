import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { AI_LEVEL_NAME, BasicAI, observerOpinions, type AiLevel, type Opinion } from '../ai/basic';
import { cardDef, cardText, isRed } from '../data/cards';
import { generalDef } from '../data/generals';
import { DRAW_GAME_PILES, Game, isDuel, isWinner, ROLE_NAME, roleLabel, winnerLabel } from '../engine/game';
import type { Card, CardPick, GameView, PlayOption, Request, Response, SkillOption, Winner } from '../engine/types';
import { CardView, Equips, GeneralCard, Hp, InfoButton, JudgeZone, Modal, RotateHint, SeatView, SideToggle } from './components';
import { HumanController, PacedController, PauseGate } from './controllers';
import { RECORD_VERSION, RecordingController, type Answer, type GameRecord } from '../engine/record';
import { loadInfer, saveGame, saveInfer } from './storage';
import { InferTag } from './infer';
import { SoundControl, SoundLayer } from './SoundControl';
import { filterLog, GeneralPanel, LOG_FILTERS, type LogFilter } from './inspect';
import { SkillTip, tipProps, TooltipHost } from './tooltip';
import { HelpPanel } from './help';
import { loadTips, markSeen, pickTip, setTipsOff, tipText, type TipDef } from './tips';
import { describeRequest, skillName } from './describe';
import { dyingSeats, EffectsLayer, PlayZone } from './effects';
import { isCrowded, seatNames, tableSides } from './layout';
import { createTutorial, TUTORIAL_NAMES, TUTORIAL_STEPS, type TutorialDirector } from './tutorial';
import { autoPickForRespond, autoTargetsForOption, autoTargetsForSkill, indexKey, SKILL_KEYS, useHotkeys, type KeyAction } from './hotkeys';

const HUMAN = 0;
const PHASE_NAME: Record<string, string> = {
  setup: '选将',
  prepare: '准备阶段',
  draw: '摸牌阶段',
  play: '出牌阶段',
  discard: '弃牌阶段',
  end: '结束阶段',
  over: '游戏结束',
};

interface Session {
  game: Game;
  human: HumanController;
  ais: PacedController[];
  gate: PauseGate;
  /** 查看武将详情时是否暂停：单机对 AI 时开启；以后联网与真人对局时应关闭 */
  pauseOnInspect: boolean;
  seed: number;
  /** 所有人的回答，按顺序（用于保存回放） */
  answers: Answer[];
  level: AiLevel;
  names: string[];
  /** 开始对局，返回胜者 */
  run: () => Promise<Winner>;
  /** 新手教学局的导演（普通对局没有） */
  director?: TutorialDirector;
}

function createSession(delay: () => number, level: AiLevel, players: number, seed?: number): Session {
  const human = new HumanController();
  const gate = new PauseGate();
  const names = seatNames(players);
  const ais = names.slice(1).map(() => new PacedController(new BasicAI(level), delay, gate));
  const answers: Answer[] = [];
  const s = seed ?? Math.floor(Math.random() * 1e9);
  const controllers = [human, ...ais].map((c, seat) => new RecordingController(c, seat, answers));
  const game = new Game({ controllers, names, seed: s });
  return { game, human, ais, gate, pauseOnInspect: true, seed: s, answers, level, names, run: () => game.start() };
}

/** 新手教学局：固定剧本，不记录回答 */
function createTutorialSession(delay: () => number): Session {
  const human = new HumanController();
  const gate = new PauseGate();
  const t = createTutorial(human, delay, gate);
  return { game: t.game, human, ais: t.ais, gate, pauseOnInspect: true, seed: 1, answers: [], level: 'normal', names: TUTORIAL_NAMES, run: t.run, director: t.director };
}

/** 对局结束后生成记录 */
function makeRecord(s: Session, winner: Winner): GameRecord {
  const me = s.game.players[HUMAN];
  return {
    version: RECORD_VERSION,
    id: `${Date.now()}-${s.seed}`,
    date: Date.now(),
    seed: s.seed,
    names: s.names,
    human: HUMAN,
    answers: s.answers,
    winner,
    turns: s.game.turn,
    role: me.role,
    general: me.general,
    won: isWinner(me, winner),
    level: s.level,
    logLength: s.game.log.length,
  };
}

interface GameScreenProps {
  onExit: () => void;
  /** 查看刚结束这一局的回放 */
  onReplay?: (rec: GameRecord) => void;
  /** AI 难度 */
  level?: AiLevel;
  /** 人数（5–8） */
  players?: number;
  /** 测试用：固定 AI 停顿与随机种子 */
  aiDelay?: number;
  seed?: number;
  /** 新手教学局：固定剧本，不保存记录 */
  tutorial?: boolean;
  /** 教程结束后点「开始正式对局」 */
  onTutorialPlay?: () => void;
}

export function GameScreen({ onExit, onReplay, level = 'normal', players = 5, aiDelay, seed, tutorial, onTutorialPlay }: GameScreenProps) {
  const [round, setRound] = useState(0);
  const [session, setSession] = useState<Session | null>(null);
  const [winner, setWinner] = useState<Winner | null>(null);
  const [record, setRecord] = useState<GameRecord | null>(null);
  const [speed, setSpeed] = useState(aiDelay ?? 600);
  const speedRef = useRef(speed);
  speedRef.current = speed;
  const [, rerender] = useReducer((x: number) => x + 1, 0);
  const tableRef = useRef<HTMLDivElement>(null);
  const [inspect, setInspect] = useState<number | null>(null);
  const [help, setHelp] = useState(false);
  const [infer, setInfer] = useState(loadInfer);
  const toggleInfer = () =>
    setInfer((on) => {
      saveInfer(!on);
      return !on;
    });
  const [logOpen, setLogOpen] = useState(false);
  const [sideOpen, setSideOpen] = useState(false);
  // 手机上侧栏是抽屉：点了里面的功能按钮就收起（调音量除外）
  const closeSideOnAction = (e: { target: EventTarget }) => {
    const t = e.target as HTMLElement;
    if (t.closest('button') && !t.closest('.sound-control, .speed')) setSideOpen(false);
  };
  const panelOpen = inspect !== null || help || logOpen;
  // 面板（武将详情 / 规则速查）打开时：Esc 关闭面板，其他快捷键不生效；没有面板时 F1 / ? 打开速查
  useHotkeys((a) => {
    if (!panelOpen) {
      if (a.type === 'infer') {
        toggleInfer();
        return true;
      }
      if (a.type === 'log' && session) {
        if (session.pauseOnInspect) session.gate.pause();
        setLogOpen(true);
        return true;
      }
      if (a.type !== 'help' || !session) return false;
      if (session.pauseOnInspect) session.gate.pause();
      setHelp(true);
      return true;
    }
    if (a.type !== 'cancel') return a.type === 'confirm' || a.type === 'nextTarget' || a.type === 'help' || a.type === 'log';
    session?.gate.resume();
    setInspect(null);
    setHelp(false);
    setLogOpen(false);
    return true;
  });

  useEffect(() => {
    const s = tutorial ? createTutorialSession(() => speedRef.current) : createSession(() => speedRef.current, level, players, seed === undefined ? undefined : seed + round);
    setSession(s);
    setWinner(null);
    setRecord(null);
    setInspect(null);
    setHelp(false);
    setLogOpen(false);
    const unsubs = [s.game.subscribe(rerender), s.human.subscribe(rerender)];
    if (s.director) unsubs.push(s.director.subscribe(rerender));
    // 只保存正常打完的局（中途重新开始/返回菜单的不保存）；教学局不保存
    s.run().then((w) => {
      if (s.human.cancelled) return;
      if (!s.director) {
        const rec = makeRecord(s, w);
        saveGame(rec);
        setRecord(rec);
      }
      setWinner(w);
    }, (e) => console.error(e));
    return () => {
      unsubs.forEach((u) => u());
      s.human.cancelled = true;
      s.ais.forEach((a) => (a.cancelled = true));
    };
  }, [round]);

  if (!session) return null;
  const { game, human, gate, pauseOnInspect, director } = session;
  const openInspect = (seat: number) => {
    if (pauseOnInspect) gate.pause();
    setInspect(seat);
  };
  const closeInspect = () => {
    gate.resume();
    setInspect(null);
  };
  const openHelp = () => {
    if (pauseOnInspect) gate.pause();
    setHelp(true);
  };
  const closeHelp = () => {
    gate.resume();
    setHelp(false);
  };
  const openLog = () => {
    if (pauseOnInspect) gate.pause();
    setLogOpen(true);
  };
  const closeLog = () => {
    gate.resume();
    setLogOpen(false);
  };
  const view = game.view(HUMAN);
  // 读局：旁观者视角（只用公开信息，不带入你的身份）
  const opinions = infer && view.turn > 0 ? observerOpinions(view) : null;
  const pending = human.pending;
  const dying = dyingSeats(game.players);
  const shortName = (s: number) => {
    const p = view.players[s];
    if (s === HUMAN) return '你';
    return p.general ? generalDef(p.general).name : p.name;
  };

  // 大屏显示在牌桌中央，小屏收进侧栏抽屉（两处由样式控制只显示一处）
  const speedControl = (
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
  );

  return (
    <div className={`game-layout ${director ? 'tutorial-mode' : ''}`}>
      <div className={`table ${isCrowded(view.players.length) ? 'crowded' : ''}`} ref={tableRef}>
        {(['right', 'top', 'left'] as const).map((side) => (
          <div key={side} className={`seat-row seat-row-${side}`}>
            {tableSides(view.players.length)[side].map((seat) => (
              <SeatSlot key={seat} game={game} view={view} seat={seat} pending={pending?.req ?? null} onInfo={() => openInspect(seat)} opinion={opinions?.[seat] ?? null} />
            ))}
          </div>
        ))}
        <div className="area-center">
          <div className="center-info">
            <div>第 {view.turn} 回合 · {view.phase === 'over' ? '游戏结束' : view.turn > 0 ? `${view.players[view.current].name} 的${PHASE_NAME[view.phase]}` : '选将'}</div>
            <div className="muted">
              牌堆 {view.drawPileCount} 张
              {view.pileExhausted > 0 && (
                <span title={`牌堆第 ${DRAW_GAME_PILES} 次被摸光时平局`}>
                  （已摸光 {view.pileExhausted}/{DRAW_GAME_PILES} 次）
                </span>
              )}{' '}
              · 弃牌堆 {view.discardPileCount} 张 · {director ? '新手教程' : `AI ${AI_LEVEL_NAME[level]}`}
            </div>
          </div>
          {dying.map((s) => (
            <div key={s} className="dying-banner">
              {shortName(s)} 濒死，求【药】！
            </div>
          ))}
          <PlayZone log={game.log} shortName={shortName} />
          {speedControl}
        </div>
        <div className="area-me">
          <PlayerArea
            key={pending ? JSON.stringify(pending.req) + game.log.length : 'idle'}
            view={view}
            human={human}
            keysEnabled={!panelOpen && !winner}
            onInfo={() => openInspect(HUMAN)}
            opinion={opinions?.[HUMAN] ?? null}
          />
        </div>
        <EffectsLayer key={round} log={game.log} container={tableRef} />
        <SoundLayer
          key={`sound-${round}`}
          log={game.log}
          pendingKey={pending ? JSON.stringify(pending.req) + game.log.length : null}
          result={winner && winner !== 'draw' ? (isWinner(game.players[HUMAN], winner) ? 'win' : 'lose') : null}
        />
        {!winner && !panelOpen && !director && <TipLayer key={`tip-${round}`} view={view} req={pending?.req ?? null} />}
        {director && !panelOpen && <TutorialLayer director={director} />}
      </div>
      <RotateHint onExit={onExit} />
      <SideToggle open={sideOpen} onToggle={() => setSideOpen((o) => !o)} />
      <aside className={`side ${sideOpen ? 'open' : ''}`} onClick={closeSideOnAction}>
        <div className="side-buttons">
          <button onClick={() => setRound((r) => r + 1)}>重新开始</button>
          <button onClick={onExit}>返回菜单</button>
          <button className={`infer-toggle ${infer ? 'active' : ''}`} onClick={toggleInfer} title="读局：显示 AI 视角对身份的推测 (I)" data-key="I">
            读局
          </button>
          <button className="help-btn" onClick={openHelp} title="规则速查 (F1)" aria-label="规则速查">
            ?
          </button>
        </div>
        <button className="log-open" onClick={openLog} title="查看出牌记录（L）；单机时游戏暂停" data-key="L">
          出牌记录
        </button>
        <SoundControl />
        {speedControl}
      </aside>
      {inspect !== null && (
        <GeneralPanel p={view.players[inspect]} players={view.players.length} isMe={inspect === HUMAN} paused={pauseOnInspect && !winner} onClose={closeInspect} />
      )}
      {logOpen && (
        <Modal title="出牌记录" onClose={closeLog}>
          <div className="log-modal">
            {pauseOnInspect && !winner && <div className="paused-tag">游戏已暂停，关闭后继续（Esc）</div>}
            <LogPanel game={game} />
          </div>
        </Modal>
      )}
      {help && <HelpPanel players={view.players} me={HUMAN} paused={pauseOnInspect && !winner} onClose={closeHelp} />}
      <TooltipHost />
      {director?.finished && !panelOpen && (
        <Modal title="教程完成">
          <p>你已经学会了出牌、装备、锦囊、响应和弃牌。接下来和电脑打一局完整的对局吧。</p>
          <p className="muted">想再看一遍，可以在主菜单点「新手教程」。</p>
          <div className="choice-row">
            {onTutorialPlay && (
              <button className="primary" onClick={onTutorialPlay}>
                开始正式对局
              </button>
            )}
            <button onClick={onExit}>返回菜单</button>
          </div>
        </Modal>
      )}
      {winner && !logOpen && (
        <GameOver
          game={game}
          winner={winner}
          onAgain={() => setRound((r) => r + 1)}
          onExit={onExit}
          onReplay={onReplay && record ? () => onReplay(record) : undefined}
          onLog={openLog}
        />
      )}
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
    return sel.skill.skill === 'huoxin' || sel.skill.skill === 'luance' ? [t0, ...(sel.skill.secondTargets?.[t0] ?? [])] : [t0];
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

function SeatSlot({
  game,
  view,
  seat,
  pending,
  onInfo,
  opinion,
}: {
  game: Game;
  view: GameView;
  seat: number;
  pending: Request | null;
  onInfo: () => void;
  opinion: Opinion | null;
}) {
  const sel = useSelection();
  const selectable = selectableSeats(pending, sel).includes(seat);
  const alive = view.players[HUMAN].alive && view.players[seat].alive;
  return (
    <SeatView
      p={view.players[seat]}
      players={view.players.length}
      isCurrent={view.current === seat && view.turn > 0}
      selectable={selectable}
      selected={sel.targets.includes(seat)}
      distance={alive ? game.distance(HUMAN, seat) : null}
      inRange={alive && game.inAttackRange(HUMAN, seat)}
      onClick={() => clickSeat(pending, sel, seat)}
      onInfo={onInfo}
      extra={opinion && <InferTag view={view} seat={seat} op={opinion} />}
    />
  );
}

// ───────────── 新手提示 ─────────────

/** 情境提示气泡：一条显示到点「知道了」为止，下一条再出现 */
function TipLayer({ view, req }: { view: GameView; req: Request | null }) {
  const sel = useSelection();
  const [current, setCurrent] = useState<TipDef | null>(null);
  const next = current ? null : pickTip({ view, req, option: sel.option, skill: sel.skill }, loadTips());
  useEffect(() => {
    if (!next) return;
    markSeen(next.id);
    setCurrent(next);
  }, [next]);
  const tip = current ?? next;
  if (!tip) return null;
  return (
    <div className="tip-bubble" role="note">
      <b>💡 {tip.title}</b>
      <div>{tipText(tip, view)}</div>
      <div className="tip-actions">
        <button className="primary" onClick={() => setCurrent(null)}>
          知道了
        </button>
        <button
          onClick={() => {
            setTipsOff(true);
            setCurrent(null);
          }}
        >
          不再显示提示
        </button>
      </div>
    </div>
  );
}

// ───────────── 新手教程 ─────────────

/** 教程气泡：讲解页点「下一步」继续；操作页显示提示，并高亮要点的牌和座位 */
function TutorialLayer({ director }: { director: TutorialDirector }) {
  const page = director.page;
  if (!page) return null;
  const e = page.expect;
  const key = !e ? null : 'use' in e ? e.use : 'respond' in e ? e.respond : 'discard' in e ? e.discard : null;
  const seat = e && 'use' in e ? e.target : undefined;
  const glow = '{ animation: tutorial-glow 1.2s ease-in-out infinite; }';
  const css = [
    key && `.me-main .hand .card[data-card="${cardDef(key).name}"]:not(.disabled) ${glow}`,
    seat !== undefined && `.seat[data-seat="${seat}"] ${glow}`,
    e && 'end' in e && `.actions button[data-key="E"] ${glow}`,
  ]
    .filter(Boolean)
    .join('\n');
  return (
    <div className={`tip-bubble tutorial-bubble ${page.low ? 'low' : ''}`} role="note">
      <b>
        📖 新手教程 <span className="muted">{page.done}/{TUTORIAL_STEPS}</span>
      </b>
      <div>{page.kind === 'do' ? `👉 ${page.text}` : page.text}</div>
      {page.nudge && <div className="tutorial-nudge">这一步请按提示操作。</div>}
      {page.kind === 'say' && (
        <div className="tip-actions">
          <button className="primary" onClick={() => director.next()}>
            下一步
          </button>
        </div>
      )}
      {css && <style>{css}</style>}
    </div>
  );
}

// ───────────── 玩家区域：自己的信息、手牌、操作按钮 ─────────────

function PlayerArea({
  view,
  human,
  keysEnabled,
  onInfo,
  opinion,
}: {
  view: GameView;
  human: HumanController;
  keysEnabled: boolean;
  onInfo: () => void;
  opinion: Opinion | null;
}) {
  const me = view.players[HUMAN];
  const hand = me.hand ?? [];
  const req = human.pending?.req ?? null;
  const sel = useSelection();

  // 新的请求到来时清空选择；响应时若只有一张能出的牌则预先选中
  useEffect(() => setSelection(req ? { ...EMPTY, cards: autoPickForRespond(req, hand) } : EMPTY), []);

  const answer = (r: Response<Request>) => {
    setSelection(EMPTY);
    human.answer(r);
  };

  const cardOption = (id: number) => (req?.type === 'play' ? req.options.find((o) => o.cardId === id) : undefined);

  function cardUsable(c: Card): boolean {
    if (!req) return false;
    switch (req.type) {
      case 'play':
        if (sel.skill?.skill === 'baodao') return cardDef(c.key).kind === 'equip';
        if (sel.skill?.skill === 'dujiang') return c.suit === 'diamond';
        if (sel.skill?.skill === 'jikun') return c.key === 'yao';
        return sel.skill ? sel.skill.cardCount > 0 : !!cardOption(c.id);
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
        const option = cardOption(c.id) ?? null;
        return setSelection({ cards: [c.id], targets: option ? autoTargetsForOption(option) : [], option, skill: null });
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
      const needTargets = sel.skill.skill === 'huoxin' || sel.skill.skill === 'luance' ? 2 : sel.skill.targets.length === 0 ? 0 : 1;
      canConfirm = picked.length === sel.skill.cardCount && sel.targets.length === needTargets;
      if (sel.skill.skill === 'huoji') canConfirm &&= picked[0].suit === picked[1].suit;
      if (sel.skill.skill === 'dujiang') canConfirm &&= picked[0].suit === 'diamond';
      if (sel.skill.skill === 'jikun') canConfirm &&= picked[0].key === 'yao';
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

  const toggleSkill = (s: SkillOption) =>
    setSelection(sel.skill?.skill === s.skill ? EMPTY : { cards: [], targets: autoTargetsForSkill(s), option: null, skill: s });

  function onKey(a: KeyAction): boolean {
    if (!req) return false;
    const hasSelection = sel.cards.length > 0 || sel.targets.length > 0 || !!sel.option || !!sel.skill;
    switch (a.type) {
      case 'confirm':
        confirm();
        return req.type === 'play' || req.type === 'respond' || req.type === 'discard';
      case 'cancel':
        if (hasSelection) return setSelection(EMPTY), true;
        if (req.type === 'respond') return answer(null), true;
        return false;
      case 'index': {
        const c = hand[a.index];
        if (c && cardUsable(c)) clickCard(c);
        return !!c;
      }
      case 'end':
        if (req.type !== 'play') return false;
        answer({ type: 'end' });
        return true;
      case 'skill': {
        const s = req.type === 'play' ? req.skills[a.index] : undefined;
        if (s) toggleSkill(s);
        return !!s;
      }
      case 'help':
      case 'infer':
      case 'log':
        return false;
      case 'nextTarget': {
        if (req.type !== 'play') return false;
        const first = sel.option?.targets ?? sel.skill?.targets ?? [];
        if (first.length === 0) return true;
        const i = sel.targets[0] === undefined ? -1 : first.indexOf(sel.targets[0]);
        setSelection({ ...sel, targets: [first[(i + 1) % first.length]] });
        return true;
      }
    }
  }
  const isModalReq = !!req && req.type !== 'play' && req.type !== 'respond' && req.type !== 'discard';
  useHotkeys(onKey, keysEnabled && !isModalReq);

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
          {me.role && <span className={`role-badge role-${me.role}`}>{roleLabel(me.role, view.players.length)}</span>}
          <InfoButton onClick={onInfo} />
        </div>
        {g && <Hp hp={Math.max(me.hp, 0)} maxHp={me.maxHp} />}
        <Equips equips={me.equips} />
        <JudgeZone judge={me.judge} />
        {opinion && <InferTag view={view} seat={me.seat} op={opinion} />}
        {g && (
          <div className="seat-skills">
            {g.skills.map((s) => (
              <div key={s.name} {...tipProps(() => <SkillTip {...s} />)}>
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
          {hand.map((c, i) => (
            <CardView
              key={c.id}
              card={c}
              hotkey={req ? indexKey(i) : undefined}
              selected={sel.cards.includes(c.id)}
              disabled={!cardUsable(c)}
              onClick={() => clickCard(c)}
            />
          ))}
          {hand.length === 0 && <span className="muted">（没有手牌）</span>}
        </div>
        <div className="actions">
          {req?.type === 'play' &&
            req.skills.map((s, i) => (
              <button
                key={s.skill}
                className={sel.skill?.skill === s.skill ? 'active' : ''}
                data-key={SKILL_KEYS[i]?.toUpperCase()}
                onClick={() => toggleSkill(s)}
              >
                发动【{skillName(s.skill)}】
              </button>
            ))}
          {(req?.type === 'play' || req?.type === 'respond' || req?.type === 'discard') && (
            <button className="primary" disabled={!canConfirm} onClick={confirm} data-key="空格">
              确定
            </button>
          )}
          {req?.type === 'play' && (
            <button onClick={() => answer({ type: 'end' })} data-key="E">
              结束出牌
            </button>
          )}
          {req?.type === 'respond' &&
            req.equipDodge?.map((c) => (
              <button key={c.id} onClick={() => answer(c.id)}>
                【死战】{cardText(c)} 当【避】
              </button>
            ))}
          {req?.type === 'respond' && (
            <button onClick={() => answer(null)} data-key="Esc">
              不出
            </button>
          )}
          {req?.type === 'respond' && req.reason.kind === 'shipo' && req.reason.group && !req.reason.countering && req.reason.trickId !== undefined && (
            <button
              title="这张群体锦囊剩下的目标都不再询问；有人出【识破】时仍会问你是否反制"
              onClick={() => {
                setSelection(EMPTY);
                human.skipShipo((req.reason as { trickId: number }).trickId);
              }}
            >
              不识破此【{cardDef(req.reason.trick).name}】
            </button>
          )}
        </div>
      </div>
      {req && <RequestModal key={JSON.stringify(req)} view={view} req={req} answer={answer} keysEnabled={keysEnabled} />}
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
    const cardNote = { huoji: '（同花色）', baodao: '（装备牌）', dujiang: '（♦ 牌，当【断粮】）', fushang: '（交给目标）', jikun: '（【药】）', luance: '（弃置）' }[sel.skill.skill as string] ?? '';
    if (sel.skill.cardCount > 0) parts.push(`选择 ${sel.skill.cardCount} 张手牌${cardNote}`);
    if (sel.skill.targets.length === 0) parts.push('点击「确定」发动');
    else parts.push(sel.skill.skill === 'huoxin' ? '依次点击出【斩】者与被【斩】者' : sel.skill.skill === 'luance' ? '依次点击两名拼点角色（先点的为发起者）' : '点击目标角色');
    return parts.join('，');
  }
  return '';
}

// ───────────── 弹窗类请求 ─────────────

function RequestModal({
  view,
  req,
  answer,
  keysEnabled,
}: {
  view: GameView;
  req: Request;
  answer: (r: Response<Request>) => void;
  keysEnabled: boolean;
}) {
  const [picked, setPicked] = useState<number[]>([]);
  const toggle = (id: number, limit: number) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id].slice(-limit)));
  const title = describeRequest(view, req);

  // 弹窗快捷键：数字键选第 N 项；选牌/排序时空格确定、Esc 清空
  const chooseCardPicks: CardPick[] =
    req.type === 'chooseCard'
      ? [...(req.handCount > 0 ? [{ zone: 'hand' } as CardPick] : []), ...req.equips.map((c) => ({ zone: 'equip', cardId: c.id }) as CardPick)]
      : [];
  useHotkeys((a) => {
    const pickLimit = req.type === 'selectCards' ? req.count : req.type === 'orderCards' ? req.cards.length : 0;
    if (a.type === 'index') {
      if (req.type === 'chooseGeneral' && req.options[a.index]) answer(req.options[a.index]);
      else if (req.type === 'choose' && req.options[a.index]) answer(req.options[a.index].id);
      else if (req.type === 'chooseCard' && chooseCardPicks[a.index]) answer(chooseCardPicks[a.index]);
      else if ((req.type === 'selectCards' || req.type === 'orderCards') && req.cards[a.index]) toggle(req.cards[a.index].id, pickLimit);
      return true;
    }
    if (pickLimit > 0 && a.type === 'confirm') {
      if (picked.length === pickLimit) answer(picked);
      return true;
    }
    if (pickLimit > 0 && a.type === 'cancel') return setPicked([]), true;
    return a.type === 'confirm' || a.type === 'nextTarget';
  }, keysEnabled);
  const hk = (i: number) => indexKey(i);

  switch (req.type) {
    case 'chooseGeneral': {
      const lord = view.players.find((p) => p.role === 'lord')!;
      const amLord = lord.seat === view.me;
      return (
        <Modal title={title}>
          <p>
            {isDuel(view.players.length) ? (
              <>
                1v1 对决，你是 <b>{roleLabel(view.players[view.me].role!, 2)}</b>
                {amLord ? '（第一回合少摸 1 张牌）' : ''}。
                {!amLord && lord.general && `对手选择了【${generalDef(lord.general).name}】。`}
              </>
            ) : (
              <>
                你的身份是 <b>{ROLE_NAME[view.players[view.me].role!]}</b>。
                {!amLord && lord.general && `主公选择了【${generalDef(lord.general).name}】。`}
              </>
            )}
          </p>
          <div className="general-grid">
            {req.options.map((g, i) => (
              <GeneralCard key={g} general={g} lord={amLord && !isDuel(view.players.length)} hotkey={hk(i)} onClick={() => answer(g)} />
            ))}
          </div>
        </Modal>
      );
    }
    case 'chooseCard':
      return (
        <Modal title={title}>
          <div className="choice-row">
            {req.handCount > 0 && (
              <button onClick={() => answer({ zone: 'hand' } as CardPick)} data-key={hk(0)}>
                随机一张手牌（共 {req.handCount} 张）
              </button>
            )}
          </div>
          <div className="hand">
            {req.equips.map((c, i) => (
              <CardView
                key={c.id}
                card={c}
                hotkey={hk(i + (req.handCount > 0 ? 1 : 0))}
                onClick={() => answer({ zone: 'equip', cardId: c.id } as CardPick)}
              />
            ))}
          </div>
        </Modal>
      );
    case 'choose':
      return (
        <Modal title={title}>
          <div className="choice-row">
            {req.options.map((o, i) => (
              <button key={o.id} onClick={() => answer(o.id)} data-key={hk(i)}>
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
            {req.cards.map((c, i) => (
              <CardView key={c.id} card={c} hotkey={hk(i)} selected={picked.includes(c.id)} onClick={() => toggle(c.id, req.count)} />
            ))}
          </div>
          <button className="primary" disabled={picked.length !== req.count} onClick={() => answer(picked)} data-key="空格">
            确定
          </button>
        </Modal>
      );
    case 'orderCards':
      return (
        <Modal title={title}>
          <div className="hand">
            {req.cards.map((c, i) => (
              <div key={c.id} className="order-wrap">
                <CardView card={c} hotkey={hk(i)} selected={picked.includes(c.id)} onClick={() => toggle(c.id, req.cards.length)} />
                {picked.includes(c.id) && <span className="order-num">{picked.indexOf(c.id) + 1}</span>}
              </div>
            ))}
          </div>
          <button className="primary" disabled={picked.length !== req.cards.length} onClick={() => answer(picked)} data-key="空格">
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
  const [filter, setFilter] = useState<LogFilter>('all');
  const n = game.log.length;
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [n, filter]);
  const entries = useMemo(() => filterLog(game.log, filter, HUMAN, game.turn).slice(-300), [n, game, filter]);
  return (
    <>
      <div className="log-filters">
        {LOG_FILTERS.map(([id, label]) => (
          <button key={id} className={filter === id ? 'active' : ''} onClick={() => setFilter(id)}>
            {label}
          </button>
        ))}
      </div>
      <div className="log" ref={ref}>
        {entries.map((e, i) => (
          <div key={i} className={e.text.startsWith('——') ? 'log-turn' : ''}>
            {e.text}
          </div>
        ))}
        {entries.length === 0 && <div className="muted">（暂无记录）</div>}
      </div>
    </>
  );
}

function GameOver({
  game,
  winner,
  onAgain,
  onExit,
  onReplay,
  onLog,
}: {
  game: Game;
  winner: Winner;
  onAgain: () => void;
  onExit: () => void;
  onReplay?: () => void;
  onLog: () => void;
}) {
  const me = game.players[HUMAN];
  const won = isWinner(me, winner);
  return (
    <Modal title={winner === 'draw' ? '平局' : won ? '胜利！' : '失败'}>
      <p>
        {winner === 'draw' ? (
          <>
            牌堆第 {DRAW_GAME_PILES} 次被摸光，<b>平局</b>，共 {game.turn} 回合。不计入战绩。
          </>
        ) : (
          <>
            <b>{winnerLabel(winner, game.players.length)}</b>获胜，共 {game.turn} 回合。
          </>
        )}
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
              <td>{roleLabel(p.role, game.players.length)}</td>
              <td>{p.alive ? `存活（${p.hp}/${p.maxHp}）` : '阵亡'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="choice-row">
        <button className="primary" onClick={onAgain}>
          再来一局
        </button>
        {onReplay && <button onClick={onReplay}>查看回放</button>}
        <button onClick={onLog}>出牌记录</button>
        <button onClick={onExit}>返回菜单</button>
      </div>
    </Modal>
  );
}
