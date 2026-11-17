/** 联机对局结束后，各人用房主发来的数据补上自己的座位，存成普通的对局记录 */
import { isWinner } from '../engine/game';
import { RECORD_VERSION, type GameRecord } from '../engine/record';
import type { SharedRecord } from './protocol';

export function onlineRecord(r: SharedRecord, seat: number, date = Date.now()): GameRecord {
  return {
    version: RECORD_VERSION,
    // 同一局只存一次（重连后房主会补发）
    id: `online-${r.seed}-${r.logLength}`,
    date,
    seed: r.seed,
    names: r.names,
    human: seat,
    answers: r.answers,
    winner: r.winner,
    turns: r.turns,
    role: r.roles[seat],
    general: r.generals[seat],
    won: isWinner({ role: r.roles[seat], alive: r.alive[seat] }, r.winner),
    level: r.level,
    logLength: r.logLength,
    mulligan: r.mulligan,
    online: true,
    ...(r.resign ? { resign: r.resign } : {}),
  };
}
