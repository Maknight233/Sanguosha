import { useState } from 'react';
import { AI_LEVEL_NAME, type AiLevel } from '../ai/basic';
import type { GameRecord } from '../engine/record';
import { PLAYER_COUNTS, ROLE_TABLE, ROLE_NAME } from '../engine/game';
import { loadLevel, loadPlayers, saveLevel, savePlayers } from './storage';
import { GameScreen } from './GameScreen';
import { RecordsScreen } from './RecordsScreen';
import { ReplayScreen } from './ReplayScreen';
import { RulesPage } from './RulesPage';

type Screen = 'menu' | 'game' | 'rules' | 'records' | 'replay';

export function App() {
  const [screen, setScreen] = useState<Screen>('menu');
  const [replaying, setReplaying] = useState<GameRecord | null>(null);
  const [level, setLevel] = useState<AiLevel>(loadLevel);
  const [players, setPlayers] = useState<number>(loadPlayers);
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
  if (screen === 'game') return <GameScreen onExit={() => setScreen('menu')} onReplay={openReplay} level={level} players={players} />;
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
        <button className="big" onClick={() => setScreen('records')}>
          对局记录
        </button>
        <button className="big" onClick={() => setScreen('rules')}>
          规则说明
        </button>
      </div>
    </main>
  );
}

/** 身份配置说明，如「主公 1、忠臣 1、反贼 2、内奸 1」 */
export function roleSummary(players: number): string {
  const roles = ROLE_TABLE[players];
  return (['lord', 'loyalist', 'rebel', 'renegade'] as const).map((r) => `${ROLE_NAME[r]} ${roles.filter((x) => x === r).length}`).join('、');
}
