import { describe, expect, it } from 'vitest';
import { createTutorial } from '../src/ui/tutorial';

describe('新手教学局', () => {
  it('按剧本自动演示能走到结束，局面与讲解一致', async () => {
    const t = createTutorial(null);
    const total = () => t.game.drawPile.length + t.game.discardPile.length + t.game.players.reduce((n, p) => n + p.hand.length + Object.values(p.equips).filter(Boolean).length + p.judge.length, 0);
    void t.run();
    // 自动演示没有真正的等待，几轮微任务后就会停在「教程结束」
    for (let i = 0; i < 200 && !t.director.finished; i++) await new Promise((r) => setTimeout(r, 0));
    expect(t.director.finished).toBe(true);
    expect(t.director.complete).toBe(true);
    const [me, a] = t.game.players;
    expect(a.alive).toBe(false);
    expect(me.hp).toBe(4);
    expect(me.maxHp).toBe(4);
    expect(me.equips.weapon?.key).toBe('huanshoudao');
    expect(t.game.turn).toBe(6);
    expect(total()).toBe(89);
    const log = t.game.log.map((l) => l.text).join('\n');
    for (const s of ['击杀反贼，奖励摸 3 张牌', '打出', '抵消了', '装备了', '回复 1 点体力']) expect(log).toContain(s);
    // 讲解里说的数字：弃牌前 5 张手牌；被长枪打到后体力 3
    expect(log).toMatch(/你（郭嘉） 弃置了 .{2,4}【斩】。/);
    expect(log).toContain('造成 1 点伤害，体力 3/4');
  });
});
