import { useState } from 'react';
import { GameScreen } from './GameScreen';
import { RulesPage } from './RulesPage';

type Screen = 'menu' | 'game' | 'rules';

export function App() {
  const [screen, setScreen] = useState<Screen>('menu');
  if (screen === 'game') return <GameScreen onExit={() => setScreen('menu')} />;
  if (screen === 'rules') return <RulesPage onBack={() => setScreen('menu')} />;
  return (
    <main className="menu">
      <h1>三国身份牌</h1>
      <p className="muted">五人身份局 · 你与四名电脑对战</p>
      <div className="menu-buttons">
        <button className="primary big" onClick={() => setScreen('game')}>
          开始游戏
        </button>
        <button className="big" onClick={() => setScreen('rules')}>
          规则说明
        </button>
      </div>
    </main>
  );
}
