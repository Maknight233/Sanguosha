import { isRed } from '../data/cards';
import { Rng } from '../engine/rng';
import type { Card, Controller, GameView, PlayAction, Request, Response, SkillOption } from '../engine/types';

/** 随机合法操作的控制器：用于压力测试与 M1 演示（正式 AI 在 M4 实现） */
export class RandomController implements Controller {
  private rng: Rng;

  constructor(seed: number) {
    this.rng = new Rng(seed);
  }

  async decide<R extends Request>(view: GameView, req: R): Promise<Response<R>> {
    return this.choose(view, req) as Response<R>;
  }

  private choose(view: GameView, req: Request): Response<Request> {
    const hand = view.players[view.me].hand ?? [];
    switch (req.type) {
      case 'chooseGeneral':
        return this.rng.pick(req.options);
      case 'play': {
        if (this.rng.next() < 0.15) return { type: 'end' };
        if (req.skills.length > 0 && (req.options.length === 0 || this.rng.next() < 0.3)) {
          return this.useSkill(req.skills, hand);
        }
        if (req.options.length === 0) return { type: 'end' };
        const opt = this.rng.pick(req.options);
        if (opt.targets.length === 0) return { type: 'use', cardId: opt.cardId };
        const target = this.rng.pick(opt.targets);
        const extras = opt.extraTargets?.[target] ?? [];
        return extras.length > 0 && this.rng.next() < 0.5
          ? { type: 'use', cardId: opt.cardId, target, extraTarget: this.rng.pick(extras) }
          : { type: 'use', cardId: opt.cardId, target };
      }
      case 'respond': {
        if (this.rng.next() < 0.3) return null;
        const usable = hand.filter((c) => req.accept.includes(c.key));
        if (usable.length > 0) return this.rng.pick(usable).id;
        if (!req.allowPair) return null;
        const red = hand.filter(isRed);
        const black = hand.filter((c) => !isRed(c));
        const pair = red.length >= 2 ? red : black;
        return [pair[0].id, pair[1].id];
      }
      case 'discard':
        return this.rng.shuffle(hand.map((c) => c.id)).slice(0, req.count);
      case 'chooseCard':
        return req.equips.length > 0 && (req.handCount === 0 || this.rng.next() < 0.5)
          ? { zone: 'equip', cardId: this.rng.pick(req.equips).id }
          : { zone: 'hand' };
      case 'choose':
        return this.rng.pick(req.options).id;
      case 'selectCards':
        return this.rng.shuffle(req.cards.map((c) => c.id)).slice(0, req.count);
      case 'orderCards':
        return this.rng.shuffle(req.cards.map((c) => c.id));
    }
  }

  private useSkill(skills: SkillOption[], hand: Card[]): PlayAction {
    const opt = this.rng.pick(skills);
    const target = this.rng.pick(opt.targets);
    let cards: number[] = [];
    if (opt.skill === 'kuanren') cards = [this.rng.pick(hand).id];
    if (opt.skill === 'huoji') {
      const bySuit = new Map<string, Card[]>();
      for (const c of hand) bySuit.set(c.suit, [...(bySuit.get(c.suit) ?? []), c]);
      const pair = [...bySuit.values()].find((g) => g.length >= 2)!;
      cards = [pair[0].id, pair[1].id];
    }
    const targets = opt.skill === 'huoxin' ? [target, this.rng.pick(opt.secondTargets![target])] : [target];
    return { type: 'skill', skill: opt.skill, cards, targets };
  }
}
