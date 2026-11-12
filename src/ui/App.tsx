import { useState } from 'react';
import { AI_LEVEL_NAME, type AiLevel } from '../ai/basic';
import type { GameRecord } from '../engine/record';
import { PLAYER_COUNTS, ROLE_TABLE, ROLE_NAME } from '../engine/game';
import { loadLevel, loadPlayers, loadTutorialAsked, saveLevel, savePlayers, saveTutorialAsked } from './storage';
import { Modal } from './components';
import { GameScreen } from './GameScreen';
import { RecordsScreen } from './RecordsScreen';
import { ReplayScreen } from './ReplayScreen';
import { RulesPage } from './RulesPage';

type Screen = 'menu' | 'game' | 'tutorial' | 'rules' | 'records' | 'replay';

export function App() {
  const [screen, setScreen] = useState<Screen>('menu');
  const [replaying, setReplaying] = useState<GameRecord | null>(null);
  const [level, setLevel] = useState<AiLevel>(loadLevel);
  const [players, setPlayers] = useState<number>(loadPlayers);
  // 第一次打开时问一次要不要看教程；选哪个都不再问
  const [askTutorial, setAskTutorial] = useState(() => !loadTutorialAsked());
  const answerTutorial = (yes: boolean) => {
    saveTutorialAsked();
    setAskTutorial(false);
    if (yes) setScreen('tutorial');
  };
  const pickPlayers = (n: number) => {
    setPlayers(n);
    savePlayers(n);
  };
  const pickLevel = (l: AiLevel) => {
    setLevel(l);
    saveLevel(l);
  };
  const openReplay = (rec: GameRecord) => {
    setReplaying(rec);
    setScreen('replay');
  };
  if (screen === 'tutorial') return <GameScreen key="tutorial" tutorial onExit={() => setScreen('menu')} onTutorialPlay={() => setScreen('game')} />;
  if (screen === 'game') return <GameScreen key="game" onExit={() => setScreen('menu')} onReplay={openReplay} level={level} players={players} />;
  if (screen === 'rules') return <RulesPage onBack={() => setScreen('menu')} />;
  if (screen === 'records') return <RecordsScreen onBack={() => setScreen('menu')} onReplay={openReplay} />;
  // 回放结束后回到对局记录
  if (screen === 'replay' && replaying) return <ReplayScreen record={replaying} onBack={() => setScreen('records')} />;
  return (
    <main className="menu">
      <h1>三国身份牌</h1>
      <p className="muted">身份局 · 你与 {players - 1} 名电脑对战</p>
      <div className="level-pick">
        人数：
        {PLAYER_COUNTS.map((n) => (
          <button key={n} className={players === n ? 'active' : ''} onClick={() => pickPlayers(n)}>
            {n} 人
          </button>
        ))}
        <div className="muted level-note">{roleSummary(players)}</div>
      </div>
      <div className="level-pick">
        电脑难度：
        {(Object.keys(AI_LEVEL_NAME) as AiLevel[]).map((l) => (
          <button key={l} className={level === l ? 'active' : ''} onClick={() => pickLevel(l)}>
            {AI_LEVEL_NAME[l]}
          </button>
        ))}
        <div className="muted level-note">
          {level === 'easy' ? '简单：电脑随便挑攻击目标、不用【识破】、只救自己和主公。' : '普通：电脑会根据公开行为推理身份、救队友、集火。'}
        </div>
      </div>
      <div className="menu-buttons">
        <button className="primary big" onClick={() => setScreen('game')}>
          开始游戏
        </button>
        <button className="big" onClick={() => setScreen('tutorial')}>
          新手教程
        </button>
        <button className="big" onClick={() => setScreen('records')}>
          对局记录
        </button>
        <button className="big" onClick={() => setScreen('rules')}>
          规则说明
        </button>
      </div>
      {askTutorial && (
        <Modal title="第一次来玩？" onClose={() => answerTutorial(false)}>
          <p>要不要先打一局教学？大约 3 分钟，一步步教你出牌。</p>
          <p className="muted">之后想看，主菜单里随时可以点「新手教程」。</p>
          <div className="choice-row">
            <button className="primary" onClick={() => answerTutorial(true)}>
              开始教程
            </button>
            <button onClick={() => answerTutorial(false)}>不用，直接玩</button>
          </div>
        </Modal>
      )}
    </main>
  );
}

/** 身份配置说明，如「主公 1、忠臣 1、反贼 2、内奸 1」 */
export function roleSummary(players: number): string {
  const roles = ROLE_TABLE[players];
  return (['lord', 'loyalist', 'rebel', 'renegade'] as const).map((r) => `${ROLE_NAME[r]} ${roles.filter((x) => x === r).length}`).join('、');
}
