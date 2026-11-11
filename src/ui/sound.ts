/**
 * 音效：用 Web Audio 现场合成，不需要音频文件。
 * 根据日志事件播放；同类声音 80ms 内只响一次，同一时刻最多 2 个声音。
 * 浏览器没有 AudioContext（如测试环境）时静默。
 */
import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { LogEntry } from '../engine/types';

export type SoundName = 'tap' | 'clang' | 'hit' | 'heavy' | 'recover' | 'flip' | 'alarm' | 'death' | 'prompt' | 'win' | 'lose';

const SETTINGS_KEY = 'sanguo.sound';
export interface SoundSettings {
  on: boolean;
  /** 0–1 */
  volume: number;
}
const DEFAULTS: SoundSettings = { on: true, volume: 0.4 };

function readSettings(): SoundSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULTS;
    const s = JSON.parse(raw) as Partial<SoundSettings>;
    return { on: typeof s.on === 'boolean' ? s.on : DEFAULTS.on, volume: typeof s.volume === 'number' ? Math.min(1, Math.max(0, s.volume)) : DEFAULTS.volume };
  } catch {
    return DEFAULTS;
  }
}

let settings = readSettings();
const listeners = new Set<() => void>();

export function getSoundSettings(): SoundSettings {
  return settings;
}

export function setSoundSettings(next: Partial<SoundSettings>): void {
  settings = { ...settings, ...next };
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* 忽略 */
  }
  listeners.forEach((f) => f());
}

export function useSoundSettings(): SoundSettings {
  return useSyncExternalStore(
    (f) => {
      listeners.add(f);
      return () => listeners.delete(f);
    },
    () => settings,
  );
}

// ───────────── 合成 ─────────────

let ctx: AudioContext | null | undefined;
function audio(): AudioContext | null {
  if (ctx !== undefined) return ctx;
  const AC = typeof window === 'undefined' ? undefined : (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
  try {
    ctx = AC ? new AC() : null;
  } catch {
    ctx = null;
  }
  return ctx;
}

/** 一个带包络的音 */
function tone(a: AudioContext, out: AudioNode, t0: number, freq: number, dur: number, type: OscillatorType, peak: number, endFreq?: number) {
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(out);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

/** 一段滤波噪声（打击、翻牌） */
function noise(a: AudioContext, out: AudioNode, t0: number, dur: number, freq: number, peak: number) {
  const len = Math.max(1, Math.floor(a.sampleRate * dur));
  const buf = a.createBuffer(1, len, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  const g = a.createGain();
  g.gain.value = peak;
  src.connect(f).connect(g).connect(out);
  src.start(t0);
}

const SYNTH: Record<SoundName, (a: AudioContext, out: AudioNode, t: number) => void> = {
  tap: (a, o, t) => tone(a, o, t, 660, 0.07, 'triangle', 0.35),
  clang: (a, o, t) => {
    tone(a, o, t, 1320, 0.35, 'sine', 0.3);
    tone(a, o, t, 1980, 0.25, 'sine', 0.12);
  },
  hit: (a, o, t) => {
    tone(a, o, t, 140, 0.18, 'sine', 0.8, 60);
    noise(a, o, t, 0.08, 1200, 0.5);
  },
  heavy: (a, o, t) => {
    tone(a, o, t, 110, 0.35, 'sine', 1, 45);
    noise(a, o, t, 0.15, 700, 0.7);
  },
  recover: (a, o, t) => {
    tone(a, o, t, 523, 0.15, 'sine', 0.35);
    tone(a, o, t + 0.1, 784, 0.22, 'sine', 0.35);
  },
  flip: (a, o, t) => noise(a, o, t, 0.06, 3000, 0.5),
  alarm: (a, o, t) => {
    tone(a, o, t, 880, 0.12, 'square', 0.18);
    tone(a, o, t + 0.16, 880, 0.12, 'square', 0.18);
  },
  death: (a, o, t) => tone(a, o, t, 330, 0.5, 'triangle', 0.4, 110),
  prompt: (a, o, t) => {
    tone(a, o, t, 988, 0.12, 'sine', 0.22);
    tone(a, o, t + 0.09, 1319, 0.18, 'sine', 0.18);
  },
  win: (a, o, t) => [523, 659, 784, 1047].forEach((f, i) => tone(a, o, t + i * 0.11, f, 0.25, 'triangle', 0.35)),
  lose: (a, o, t) => [392, 330, 262].forEach((f, i) => tone(a, o, t + i * 0.16, f, 0.3, 'triangle', 0.35)),
};

const lastPlayed = new Map<SoundName, number>();
let recent: number[] = [];
/** 同类间隔 / 同时最多个数 / 「同时」的窗口 */
const SAME_GAP_MS = 80;
const MAX_CONCURRENT = 2;
const WINDOW_MS = 150;

/** 是否允许现在播放（节流），返回 true 时会记录 */
export function admit(name: SoundName, now: number): boolean {
  const last = lastPlayed.get(name);
  if (last !== undefined && now - last < SAME_GAP_MS) return false;
  recent = recent.filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_CONCURRENT) return false;
  recent.push(now);
  lastPlayed.set(name, now);
  return true;
}

export function resetThrottle(): void {
  lastPlayed.clear();
  recent = [];
}

export function playSound(name: SoundName): void {
  if (!settings.on || settings.volume <= 0) return;
  if (!admit(name, typeof performance !== 'undefined' ? performance.now() : Date.now())) return;
  const a = audio();
  if (!a) return;
  if (a.state === 'suspended') void a.resume().catch(() => {});
  const master = a.createGain();
  master.gain.value = settings.volume;
  master.connect(a.destination);
  SYNTH[name](a, master, a.currentTime + 0.005);
}

// ───────────── 事件 → 声音 ─────────────

/** 一条日志对应的声音（没有则为 null） */
export function soundFor(e: LogEntry): SoundName | null {
  const ev = e.event;
  if (!ev) return null;
  switch (ev.type) {
    case 'use':
      return ev.cards.some((c) => c.key === 'bi' || c.key === 'shipo') ? 'clang' : 'tap';
    case 'damage':
      return ev.amount >= 2 ? 'heavy' : 'hit';
    case 'recover':
      return 'recover';
    case 'judge':
      return 'flip';
    case 'dying':
      return 'alarm';
    case 'death':
      return 'death';
    default:
      return null;
  }
}

/**
 * 为新增的日志播放声音。maxStep：一次新增超过这么多条时视为跳转，不发声（回放拖动进度条）。
 */
export function useLogSounds(log: LogEntry[], maxStep = Infinity): void {
  const seen = useRef(log.length);
  const n = log.length;
  useEffect(() => {
    const from = seen.current;
    seen.current = n;
    if (n <= from || n - from > maxStep) return;
    for (const e of log.slice(from, n)) {
      const s = soundFor(e);
      if (s) playSound(s);
    }
  }, [n, log, maxStep]);
}
