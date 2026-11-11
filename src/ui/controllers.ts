import type { Controller, GameView, Request, Response } from '../engine/types';

type Resolver = (r: Response<Request>) => void;

/** 人类玩家：把引擎的请求挂起，等待界面操作后再回答 */
export class HumanController implements Controller {
  pending: { req: Request; resolve: Resolver } | null = null;
  /** 选择「不识破」的群体锦囊牌 id：此牌后续目标不再询问（别人出【识破】时的反制仍会询问） */
  skipShipoTrick: number | null = null;
  private listeners = new Set<() => void>();
  cancelled = false;

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify() {
    for (const l of this.listeners) l();
  }

  decide<R extends Request>(_view: GameView, req: R): Promise<Response<R>> {
    if (this.cancelled) return new Promise(() => {});
    if (this.skipsShipo(req)) return Promise.resolve(null as Response<R>);
    return new Promise((res) => {
      this.pending = {
        req,
        resolve: (r) => {
          this.pending = null;
          this.notify();
          res(r as Response<R>);
        },
      };
      this.notify();
    });
  }

  answer(r: Response<Request>): void {
    this.pending?.resolve(r);
  }

  /** 群体锦囊：本张牌对所有目标都不出【识破】 */
  skipShipo(trickId: number): void {
    this.skipShipoTrick = trickId;
    this.answer(null);
  }

  private skipsShipo(req: Request): boolean {
    if (req.type !== 'respond' || req.reason.kind !== 'shipo') return false;
    return !req.reason.countering && req.reason.trickId !== undefined && req.reason.trickId === this.skipShipoTrick;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 暂停闸门：暂停期间 AI 不做新的决策（例如查看武将详情时） */
export class PauseGate {
  private waiters: Array<() => void> = [];
  paused = false;

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
    const w = this.waiters.splice(0);
    w.forEach((f) => f());
  }

  /** 未暂停时立即返回；暂停时等到恢复 */
  wait(): Promise<void> {
    if (!this.paused) return Promise.resolve();
    return new Promise((r) => this.waiters.push(r));
  }
}

/** 包装 AI：每次决策前稍作停顿，让玩家看清局势；暂停时等待；对局放弃后停止运行 */
export class PacedController implements Controller {
  cancelled = false;

  constructor(
    private readonly inner: Controller,
    private readonly delay: () => number,
    private readonly gate?: PauseGate,
  ) {}

  async decide<R extends Request>(view: GameView, req: R): Promise<Response<R>> {
    // 出牌决策停顿较长，响应类决策较短
    const ms = req.type === 'play' ? this.delay() : this.delay() / 2;
    if (ms > 0) await sleep(ms);
    if (this.gate) await this.gate.wait();
    if (this.cancelled) return new Promise(() => {});
    return this.inner.decide(view, req);
  }
}
