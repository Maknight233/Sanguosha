import { useState } from 'react';
import type { GameRecord } from '../engine/record';
import { GameScreen } from './GameScreen';
import { RecordsScreen } from './RecordsScreen';
import { ReplayScreen } from './ReplayScreen';
import { RulesPage } from './RulesPage';

type Screen = 'menu' | 'game' | 'rules' | 'records' | 'replay';

export function App() {
  const [screen, setScreen] = useState<Screen>('menu');
  const [replaying, setReplaying] = useState<GameRecord | null>(null);
  const openReplay = (rec: GameRecord) => {
    setReplaying(rec);
    setScreen('replay');
  };
  if (screen === 'game') return <GameScreen onExit={() => setScreen('menu')} onReplay={openReplay} />;
  if (screen === 'rules') return <RulesPage onBack={() => setScreen('menu')} />;
  if (screen === 'records') return <RecordsScreen onBack={() => setScreen('menu')} onReplay={openReplay} />;
  // 回放结束后回到对局记录
  if (screen === 'replay' && replaying) return <ReplayScreen record={replaying} onBack={() => setScreen('records')} />;
  return (
    <main className="menu">
      <h1>三国身份牌</h1>
      <p className="muted">五人身份局 · 你与四名电脑对战</p>
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
