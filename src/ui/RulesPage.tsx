import { CARD_DEFS, DECK_SPEC } from '../data/cards';
import { GENERAL_KEYS } from '../data/generals';
import { GeneralCard } from './components';
import { RULE_TOPICS } from './help';

const KIND_ORDER = ['basic', 'trick', 'equip'] as const;
const KIND_TITLE = { basic: '基础牌', trick: '锦囊牌', equip: '装备牌' };

export function RulesPage({ onBack }: { onBack: () => void }) {
  const count = Object.fromEntries(DECK_SPEC.map((d) => [d.key, d.count]));
  return (
    <main className="rules">
      <button onClick={onBack}>← 返回</button>
      <h1>规则说明</h1>

      {RULE_TOPICS.map((t) => (
        <section key={t.id}>
          <h2>{t.title}</h2>
          {t.body}
        </section>
      ))}

      <h2>卡牌（共 {DECK_SPEC.reduce((n, d) => n + d.count, 0)} 张）</h2>
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
          <GeneralCard key={g} general={g} duelNote />
        ))}
      </div>
    </main>
  );
}
