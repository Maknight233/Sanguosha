// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { LogEntry } from '../src/engine/types';
import { admit, getSoundSettings, playSound, resetThrottle, setSoundSettings, soundFor } from '../src/ui/sound';
import { SoundControl, SoundLayer } from '../src/ui/SoundControl';

/** 假的 AudioContext：只数「主音量节点」被创建了几次 = 播放了几个声音 */
let plays = 0;
class FakeParam {
  value = 0;
  setValueAtTime() {}
  exponentialRampToValueAtTime() {}
}
class FakeNode {
  gain = new FakeParam();
  frequency = new FakeParam();
  type = '';
  buffer: unknown = null;
  connect(n: unknown) {
    return n;
  }
  start() {}
  stop() {}
}
class FakeAudioContext {
  currentTime = 0;
  sampleRate = 8000;
  state = 'running';
  destination = new FakeNode();
  createGain() {
    return new FakeNode();
  }
  createOscillator() {
    return new FakeNode();
  }
  createBiquadFilter() {
    return new FakeNode();
  }
  createBufferSource() {
    return new FakeNode();
  }
  createBuffer(_c: number, len: number) {
    return { getChannelData: () => new Float32Array(len) };
  }
}

beforeAll(() => {
  // 每次 playSound 都会先建一个主音量节点再连到 destination
  const proto = FakeAudioContext.prototype as unknown as { createGain: () => FakeNode };
  const orig = proto.createGain;
  proto.createGain = function (this: FakeAudioContext) {
    const n = orig.call(this);
    const connect = n.connect.bind(n);
    n.connect = (dest: unknown) => {
      if (dest === this.destination) plays++;
      return connect(dest);
    };
    return n;
  };
  (window as unknown as { AudioContext: unknown }).AudioContext = FakeAudioContext;
});
beforeEach(() => {
  plays = 0;
  resetThrottle();
  setSoundSettings({ on: true, volume: 0.4 });
});
afterEach(cleanup);

const card = (key: string) => ({ id: 1, key, suit: 'spade' as const, rank: 1 });
const entry = (event: LogEntry['event']): LogEntry => ({ turn: 1, text: '', event });

describe('事件 → 声音', () => {
  it('按事件类型选择音色', () => {
    expect(soundFor(entry({ type: 'use', from: 0, to: [1], cards: [card('zhan')] }))).toBe('tap');
    expect(soundFor(entry({ type: 'use', from: 1, to: [], cards: [card('bi')] }))).toBe('clang');
    expect(soundFor(entry({ type: 'damage', seat: 1, amount: 1, from: 0 }))).toBe('hit');
    expect(soundFor(entry({ type: 'damage', seat: 1, amount: 3, from: null }))).toBe('heavy');
    expect(soundFor(entry({ type: 'recover', seat: 1, amount: 1 }))).toBe('recover');
    expect(soundFor(entry({ type: 'dying', seat: 1 }))).toBe('alarm');
    expect(soundFor(entry({ type: 'death', seat: 1 }))).toBe('death');
    expect(soundFor(entry({ type: 'turn', seat: 1 }))).toBeNull();
    expect(soundFor({ turn: 1, text: '无事件' })).toBeNull();
  });

  it('节流：同类 80ms 内只响一次，150ms 内最多 2 个', () => {
    expect(admit('hit', 0)).toBe(true);
    expect(admit('hit', 50)).toBe(false);
    expect(admit('tap', 60)).toBe(true);
    expect(admit('clang', 70)).toBe(false);
    expect(admit('hit', 200)).toBe(true);
  });
});

describe('播放', () => {
  it('静音或音量为 0 时不播放', () => {
    playSound('hit');
    expect(plays).toBe(1);
    resetThrottle();
    setSoundSettings({ on: false });
    playSound('hit');
    setSoundSettings({ on: true, volume: 0 });
    playSound('tap');
    expect(plays).toBe(1);
  });

  it('设置会记住', () => {
    setSoundSettings({ volume: 0.7, on: false });
    expect(JSON.parse(localStorage.getItem('sanguo.sound')!)).toEqual({ on: false, volume: 0.7 });
    expect(getSoundSettings()).toEqual({ on: false, volume: 0.7 });
  });

  it('SoundLayer：新日志发声，大步跳转（回放拖动）不发声', () => {
    const e1 = entry({ type: 'damage', seat: 1, amount: 1, from: 0 });
    const e2 = entry({ type: 'recover', seat: 1, amount: 1 });
    const { rerender } = render(<SoundLayer log={[]} maxStep={2} />);
    rerender(<SoundLayer log={[e1]} maxStep={2} />);
    expect(plays).toBe(1);
    resetThrottle();
    rerender(<SoundLayer log={[e1, e2, e1, e2, e1]} maxStep={2} />);
    expect(plays).toBe(1);
    rerender(<SoundLayer log={[e1]} maxStep={2} />);
    expect(plays).toBe(1);
  });

  it('SoundLayer：出现新的操作请求时响提示音，结束时响胜负', () => {
    const { rerender } = render(<SoundLayer log={[]} pendingKey={null} />);
    rerender(<SoundLayer log={[]} pendingKey="a" />);
    rerender(<SoundLayer log={[]} pendingKey="a" />);
    expect(plays).toBe(1);
    resetThrottle();
    rerender(<SoundLayer log={[]} pendingKey={null} result="win" />);
    expect(plays).toBe(2);
  });

  it('声音控件：开关与音量', () => {
    render(<SoundControl />);
    fireEvent.click(screen.getByText(/声音/));
    expect(getSoundSettings().on).toBe(false);
    expect(screen.getByText(/静音/)).toBeTruthy();
    fireEvent.click(screen.getByText(/静音/));
    fireEvent.change(screen.getByLabelText('音量'), { target: { value: '25' } });
    expect(getSoundSettings()).toEqual({ on: true, volume: 0.25 });
  });
});
