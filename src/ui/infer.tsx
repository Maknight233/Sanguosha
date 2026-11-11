import type { Opinion, Relation } from '../ai/basic';
import { generalDef } from '../data/generals';
import type { GameView } from '../engine/types';
import { tipProps } from './tooltip';

const VERDICT: Record<Opinion['verdict'], string> = { loyal: '偏忠', rebel: '偏反', unclear: '看不出' };
const RELATION: Record<Relation, string> = { friend: '友', enemy: '敌', neutral: '中立' };
export const RENEGADE_MODE_NAME: Record<string, string> = {
  wait: '按兵不动',
  lord: '帮主公',
  rebels: '帮反贼',
  balance: '平衡（打忠臣、保反贼）',
};

const fmt = (x: number) => (x > 0 ? '+' : '') + x.toFixed(2);

function seatName(view: GameView, s: number): string {
  const p = view.players[s];
  return p.general ? generalDef(p.general).name : p.name;
}

/** 推理依据：此人帮过谁、打过谁（公开记录） */
function Reasons({ view, seat, op }: { view: GameView; seat: number; op: Opinion | null }) {
  const rows = view.players
    .filter((t) => t.seat !== seat)
    .map((t) => ({ t: t.seat, help: view.help[seat]?.[t.seat] ?? 0, hit: view.hostility[seat]?.[t.seat] ?? 0 }))
    .filter((r) => r.help > 0 || r.hit > 0);
  return (
    <div className="infer-tip">
      <div className="tip-head">
        <b>{seatName(view, seat)}</b>
        {op && <span className="tip-sub">倾向分 {fmt(op.lean)} · 内奸嫌疑 {op.suspicion.toFixed(2)}</span>}
      </div>
      {rows.length === 0 ? (
        <div className="muted">还没有帮助或攻击过别人。</div>
      ) : (
        <ul>
          {rows.map((r) => (
            <li key={r.t}>
              对 {seatName(view, r.t)}：{r.help > 0 && `帮助 ${r.help.toFixed(1)}`}
              {r.help > 0 && r.hit > 0 && '，'}
              {r.hit > 0 && `攻击 ${r.hit.toFixed(1)}`}
            </li>
          ))}
        </ul>
      )}
      <div className="muted">倾向分按「帮了偏忠的人 / 打了偏反的人」连锁推算，超过 ±0.4 才下结论。</div>
    </div>
  );
}

/** 座位下方的一行推测 */
export function InferTag({ view, seat, op, relation }: { view: GameView; seat: number; op: Opinion | null; relation?: Relation | null }) {
  if (!op && !relation) return null;
  return (
    <div className="infer-row" {...tipProps(() => <Reasons view={view} seat={seat} op={op} />)}>
      {op && (
        <span className={`infer-tag infer-${op.verdict}`}>
          {VERDICT[op.verdict]} {fmt(op.lean)}
        </span>
      )}
      {op?.suspected && <span className="infer-tag infer-suspect">疑似内奸</span>}
      {relation && <span className={`infer-tag rel-${relation}`}>{RELATION[relation]}</span>}
    </div>
  );
}
