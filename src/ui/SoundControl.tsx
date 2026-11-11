import { useEffect, useRef } from 'react';
import type { LogEntry } from '../engine/types';
import { playSound, setSoundSettings, useLogSounds, useSoundSettings } from './sound';

/** 声音开关 + 音量（对局与回放共用，设置会记住） */
export function SoundControl() {
  const s = useSoundSettings();
  return (
    <div className="sound-control">
      <button className={s.on ? 'active' : ''} onClick={() => setSoundSettings({ on: !s.on })} title="声音开关" aria-pressed={s.on}>
        {s.on ? '🔊 声音' : '🔇 静音'}
      </button>
      <input
        type="range"
        min={0}
        max={100}
        value={Math.round(s.volume * 100)}
        aria-label="音量"
        disabled={!s.on}
        onChange={(e) => setSoundSettings({ volume: Number(e.target.value) / 100 })}
        onMouseUp={() => playSound('tap')}
      />
    </div>
  );
}

/** 按日志播放音效；pendingKey 变化（出现新的需要你操作的请求）时播放提示音；result 为对局结果 */
export function SoundLayer({ log, maxStep, pendingKey, result }: { log: LogEntry[]; maxStep?: number; pendingKey?: string | null; result?: 'win' | 'lose' | null }) {
  useLogSounds(log, maxStep);
  const lastPending = useRef<string | null>(null);
  useEffect(() => {
    if (pendingKey && pendingKey !== lastPending.current) playSound('prompt');
    lastPending.current = pendingKey ?? null;
  }, [pendingKey]);
  useEffect(() => {
    if (result) playSound(result);
  }, [result]);
  return null;
}
