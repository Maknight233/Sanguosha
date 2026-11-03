import { CARD_DEFS, DECK_SPEC } from '../data/cards';
import { GENERAL_KEYS } from '../data/generals';
import { GeneralCard } from './components';

const KIND_ORDER = ['basic', 'trick', 'equip'] as const;
const KIND_TITLE = { basic: '基础牌', trick: '锦囊牌', equip: '装备牌' };

export function RulesPage({ onBack }: { onBack: () => void }) {
  const count = Object.fromEntries(DECK_SPEC.map((d) => [d.key, d.count]));
  return (
    <main className="rules">
      <button onClick={onBack}>← 返回</button>
      <h1>规则说明</h1>

      <h2>身份与胜负</h2>
      <p>5 名玩家：主公 1、忠臣 1、反贼 2、内奸 1。只有主公身份公开，主公体力上限 +1；其他人阵亡时才亮出身份。</p>
      <ul>
        <li><b>主公与忠臣</b>：消灭所有反贼和内奸。</li>
        <li><b>反贼</b>：击杀主公。</li>
        <li><b>内奸</b>：成为最后唯一存活的角色（主公最后死于与内奸的单挑）。</li>
      </ul>
      <p>奖惩：击杀反贼者摸 3 张牌；主公误杀忠臣，弃置所有手牌和装备。</p>

      <h2>回合流程</h2>
      <p>从主公开始按座位轮流。每回合：<b>摸牌</b>（2 张）→ <b>出牌</b>（可使用任意张牌，【斩】限 1 次）→ <b>弃牌</b>（手牌数不能超过当前体力）。</p>

      <h2>距离与攻击范围</h2>
      <p>
        距离是沿座位圈两个方向中较近的人数（阵亡者不计）。进攻马让你到别人的距离 -1，防御马让别人到你的距离 +1，最小为 1。
        攻击范围默认为 1，由武器决定；只有距离不超过攻击范围的角色才能成为【斩】的目标。
      </p>

      <h2>濒死</h2>
      <p>体力降到 0 时进入濒死，从当前回合角色开始依次询问是否使用【药】救援；体力回到 1 以上即脱离，否则阵亡。</p>

      <h2>卡牌（共 80 张）</h2>
      {KIND_ORDER.map((kind) => (
        <section key={kind}>
          <h3>{KIND_TITLE[kind]}</h3>
          <table>
            <tbody>
              {Object.values(CARD_DEFS)
                .filter((d) => d.kind === kind)
                .map((d) => (
                  <tr key={d.key}>
                    <td className="nowrap">【{d.name}】×{count[d.key]}</td>
                    <td>{d.description}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </section>
      ))}

      <h2>武将</h2>
      <div className="general-grid">
        {GENERAL_KEYS.map((g) => (
          <GeneralCard key={g} general={g} />
        ))}
      </div>
    </main>
  );
}
