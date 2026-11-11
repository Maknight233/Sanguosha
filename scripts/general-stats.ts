/**
 * 用法：npx vite-node scripts/general-stats.ts [局数] [并行进程数，默认 1]
 * AI 随机选将，统计每个武将按身份校正后的胜率（该武将胜率 − 同身份平均胜率）。
 * 人数：环境变量 PLAYERS=5…8（默认 5）。
 * 调参：环境变量 SKILL='{"bushiPerRound":true}' 覆盖 SKILL_TUNING（见 src/engine/game.ts）。
 * 内奸策略：环境变量 RENEGADE='{"balanceWide":false}' 覆盖 RENEGADE_TUNING（见 src/ai/basic.ts）。
 * 内部：SHARD=i/n 时只跑 seed % n === i 的局，并输出 JSON 原始计数。
 */
import { spawn } from 'node:child_process';
import { BasicAI, RENEGADE_TUNING } from '../src/ai/basic';
import { Game, isWinner, ROLE_TABLE, SKILL_TUNING } from '../src/engine/game';
import type { Controller, GameView, Request, Response, Role, Winner } from '../src/engine/types';
import { GENERALS } from '../src/data/generals';

const N = Number(process.argv[2] ?? 2000);
const JOBS = Number(process.argv[3] ?? 1);
const PLAYERS = Number(process.env.PLAYERS ?? 5);
// 临时覆盖身份配置，如 ROLES=lord,loyalist,rebel,rebel,renegade,renegade
if (process.env.ROLES) ROLE_TABLE[PLAYERS] = process.env.ROLES.split(',') as Role[];
Object.assign(SKILL_TUNING, JSON.parse(process.env.SKILL ?? '{}'));
Object.assign(RENEGADE_TUNING, JSON.parse(process.env.RENEGADE ?? '{}'));

/** 原始计数：roles[身份] = [胜, 场]；gens[武将][身份] = [胜, 场] */
interface Raw {
  roles: Record<string, [number, number]>;
  gens: Record<string, Record<string, [number, number]>>;
}


async function runShard(index: number, total: number): Promise<Raw> {
  let rng = 1;
  const rand = () => ((rng = (rng * 1103515245 + 12345) % 2147483648) / 2147483648);
  class RandomPick implements Controller {
    ai = new BasicAI();
    async decide<R extends Request>(view: GameView, req: R): Promise<Response<R>> {
      if (req.type === 'chooseGeneral') return req.options[Math.floor(rand() * req.options.length)] as Response<R>;
      return this.ai.decide(view, req);
    }
  }
  const raw: Raw = { roles: {}, gens: {} };
  for (let seed = 1; seed <= N; seed++) {
    if (seed % total !== index) continue;
    rng = seed * 7919;
    const game = new Game({ controllers: Array.from({ length: PLAYERS }, () => new RandomPick()), seed, maxTurns: 500 });
    let w: Winner;
    try {
      w = await game.start();
    } catch (e) {
      if (process.env.SHOWERR) console.error('seed', seed, String(e));
      continue;
    }
    for (const p of game.players) {
      const ok = isWinner(p, w) ? 1 : 0;
      const r = (raw.roles[p.role] ??= [0, 0]);
      r[0] += ok;
      r[1]++;
      const g = ((raw.gens[p.general!] ??= {})[p.role] ??= [0, 0]);
      g[0] += ok;
      g[1]++;
    }
  }
  return raw;
}

function merge(parts: Raw[]): Raw {
  const out: Raw = { roles: {}, gens: {} };
  const add = (a: [number, number], b: [number, number]) => ((a[0] += b[0]), (a[1] += b[1]));
  for (const p of parts) {
    for (const [r, v] of Object.entries(p.roles)) add((out.roles[r] ??= [0, 0]), v);
    for (const [g, byRole] of Object.entries(p.gens))
      for (const [r, v] of Object.entries(byRole)) add(((out.gens[g] ??= {})[r] ??= [0, 0]), v);
  }
  return out;
}

function runChild(index: number): Promise<Raw> {
  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['vite-node', 'scripts/general-stats.ts', String(N)], {
      env: { ...process.env, SHARD: `${index}/${JOBS}` },
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve(JSON.parse(out.trim().split('\n').pop()!)) : reject(new Error(`子进程 ${index} 退出码 ${code}`))));
  });
}

function report(raw: Raw): void {
  const avg = (r: string) => raw.roles[r][0] / raw.roles[r][1];
  const games = raw.roles.lord?.[1] ?? 0;
  console.log(`${PLAYERS} 人，共 ${games} 局；调参 ${JSON.stringify(SKILL_TUNING)}`);
  console.log('各身份平均胜率', Object.fromEntries(Object.keys(raw.roles).map((r) => [r, (avg(r) * 100).toFixed(1) + '%'])));
  const rows = Object.entries(raw.gens).map(([g, byRole]) => {
    let n = 0;
    let diff = 0;
    for (const [r, [w, c]] of Object.entries(byRole)) {
      n += c;
      diff += w - c * avg(r);
    }
    return { name: GENERALS[g]?.name ?? g, n, rate: diff / n };
  });
  for (const row of rows.sort((a, b) => b.rate - a.rate)) console.log(`${row.name}\t${row.n} 次\t${(row.rate * 100).toFixed(1)}%`);
}

const shard = process.env.SHARD;
if (shard) {
  const [i, n] = shard.split('/').map(Number);
  console.log(JSON.stringify(await runShard(i, n)));
} else if (JOBS > 1) {
  report(merge(await Promise.all(Array.from({ length: JOBS }, (_, i) => runChild(i)))));
} else {
  report(await runShard(0, 1));
}
