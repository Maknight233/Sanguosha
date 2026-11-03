import type { Controller, GameView, Request, Response } from '../engine/types';

type Resolver = (r: Response<Request>) => void;

/** 人类玩家：把引擎的请求挂起，等待界面操作后再回答 */
export class HumanController implements Controller {
  pending: { req: Request; resolve: Resolver } | null = null;
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
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 包装 AI：每次决策前稍作停顿，让玩家看清局势；对局放弃后停止运行 */
export class PacedController implements Controller {
  cancelled = false;

  constructor(
    private readonly inner: Controller,
    private readonly delay: () => number,
  ) {}

  async decide<R extends Request>(view: GameView, req: R): Promise<Response<R>> {
    // 出牌决策停顿较长，响应类决策较短
    const ms = req.type === 'play' ? this.delay() : this.delay() / 2;
    if (ms > 0) await sleep(ms);
    if (this.cancelled) return new Promise(() => {});
    return this.inner.decide(view, req);
  }
}
