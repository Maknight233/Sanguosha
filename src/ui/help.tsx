import { useState, type ReactNode } from 'react';
import { DRAW_PER_TURN, ROLE_NAME } from '../engine/game';
import { FACTION_NAME, generalDef } from '../data/generals';
import type { PlayerPublic } from '../engine/types';
import { Modal } from './components';
import { loadTips, resetTips, setTipsOff } from './tips';

/** 规则主题：主菜单的规则说明页与对局中的速查面板共用 */
export interface RuleTopic {
  id: string;
  title: string;
  body: ReactNode;
}

export const RULE_TOPICS: RuleTopic[] = [
  {
    id: 'turn',
    title: '回合流程',
    body: (
      <>
        <p>
          从主公开始按座位轮流。每回合：<b>准备</b>（判定区的延时锦囊判定）→ <b>摸牌</b>（{DRAW_PER_TURN} 张）→ <b>出牌</b>（可使用任意张牌，【斩】限 1 次）→{' '}
          <b>弃牌</b>（手牌数不能超过当前体力）→ <b>结束</b>。
        </p>
        <p>体力降到 0 时进入濒死，从当前回合角色开始依次询问是否使用【药】救援；体力回到 1 以上即脱离，否则阵亡。</p>
      </>
    ),
  },
  {
    id: 'distance',
    title: '距离与攻击范围',
    body: (
      <p>
        距离是沿座位圈两个方向中较近的人数（阵亡者不计）。进攻马让你到别人的距离 -1，防御马让别人到你的距离 +1，最小为 1。
        攻击范围默认为 1，由武器决定；只有距离不超过攻击范围的角色才能成为【斩】的目标。座位上会显示你到该角色的距离，以及能否攻击。
      </p>
    ),
  },
  {
    id: 'judge',
    title: '判定与延时锦囊',
    body: (
      <>
        <p>判定：翻开牌堆顶一张牌作为判定牌，按花色决定结果，结算后进入弃牌堆。</p>
        <p>
          延时锦囊（【断粮】【军令】）使用后置于目标的判定区，同名的最多一张。目标的准备阶段按放入顺序逐张判定：判定前任何角色都可以打出【识破】抵消它（直接弃置）；
          否则进行判定，按花色决定是否生效。角色阵亡时判定区的牌一并弃置。
        </p>
        <p>
          【天雷】对自己使用，判定为 ♠2–9 时受到 3 点伤害（无来源，不算任何人击杀）；没劈中或被【识破】抵消，就移到下家的判定区，一直传下去，直到劈中某人为止。
        </p>
        <p>【兽面盾】在成为【劫营】【策反】的目标时也要判定（红色则无效）。</p>
        <p>部分武将技能也与判定有关：魏延【奇袭】自己进行判定，荀彧【定策】可以改判，于吉【卜筮】可以获得别人的判定牌，吕蒙【渡江】把 ♦ 牌当【断粮】。</p>
      </>
    ),
  },
  {
    id: 'roles',
    title: '身份与胜负',
    body: (
      <>
        <p>5–8 名玩家，身份配置：5 人 主忠反反内；6 人 主忠反反内内；7 人 主忠忠反反反内；8 人 主忠忠反反反内内。只有主公身份公开，5、6 人局主公体力上限 +1；其他人阵亡时才亮出身份。有 2 名内奸时，两人互为敌人，只有最后存活的那名内奸获胜。</p>
        <ul>
          <li>
            <b>主公与忠臣</b>：消灭所有反贼和内奸。
          </li>
          <li>
            <b>反贼</b>：击杀主公。
          </li>
          <li>
            <b>内奸</b>：成为最后唯一存活的角色（主公最后死于与内奸的单挑）。
          </li>
        </ul>
        <p>奖惩：击杀反贼者摸 3 张牌；主公误杀忠臣，弃置所有手牌和装备。</p>
      </>
    ),
  },
  {
    id: 'keys',
    title: '操作与快捷键',
    body: (
      <>
        <p>点手牌 → 点目标 → 「确定」。只有一个合法目标时会自动选中；被要求出牌时如果只有一张能出的牌，也会预先选中，按空格即可打出。</p>
        <table>
          <tbody>
            {[
              ['空格 / Enter', '确定'],
              ['Esc', '取消当前选择；没有选择时为「不出」；也用于关闭面板'],
              ['1–9、0', '选第 1–10 张手牌（再按一次取消）；弹窗中选第 N 项'],
              ['E', '结束出牌'],
              ['Q、W', '发动第 1、2 个技能'],
              ['Tab', '在可选目标之间切换'],
              ['F1 / ?', '打开规则速查'],
            ].map(([k, v]) => (
              <tr key={k}>
                <td className="nowrap">{k}</td>
                <td>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </>
    ),
  },
];

/** 本局武将：只列出场上角色的技能 */
function CurrentGenerals({ players, me }: { players: PlayerPublic[]; me: number }) {
  return (
    <div className="help-generals">
      {players.map((p) => {
        if (!p.general) return null;
        const g = generalDef(p.general);
        const isLord = p.role === 'lord';
        return (
          <div key={p.seat} className={`help-general ${p.alive ? '' : 'muted'}`}>
            <b>
              {p.seat === me ? '你' : p.name} · {g.name}
            </b>
            <span className="faction-tag">{FACTION_NAME[g.faction]}</span>
            {p.role && <span className={`role-badge role-${p.role}`}>{ROLE_NAME[p.role]}</span>}
            {!p.alive && '（阵亡）'}
            {g.skills.map((s) => (
              <p key={s.name} className="skill-text">
                <b>【{s.name}】</b>
                {s.lordSkill && <span className="muted">（主公技{isLord ? '' : '，未生效'}）</span>}
                {s.description}
              </p>
            ))}
          </div>
        );
      })}
    </div>
  );
}

/** 对局中的规则速查面板 */
export function HelpPanel({ players, me, paused, onClose }: { players: PlayerPublic[]; me: number; paused: boolean; onClose: () => void }) {
  const tabs = [...RULE_TOPICS.map((t) => ({ id: t.id, title: t.title })), { id: 'generals', title: '本局武将' }];
  const [tab, setTab] = useState('generals');
  const [tips, setTips] = useState(loadTips);
  const topic = RULE_TOPICS.find((t) => t.id === tab);
  return (
    <Modal title="规则速查" onClose={onClose}>
      <div className="help">
        {paused && <div className="paused-tag">游戏已暂停，关闭面板后继续（Esc）</div>}
        <div className="help-tabs">
          {tabs.map((t) => (
            <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
              {t.title}
            </button>
          ))}
        </div>
        <div className="help-body">{topic ? topic.body : <CurrentGenerals players={players} me={me} />}</div>
        <div className="help-footer">
          <label>
            <input
              type="checkbox"
              checked={!tips.off}
              onChange={(e) => {
                setTipsOff(!e.target.checked);
                setTips(loadTips());
              }}
            />{' '}
            显示新手提示
          </label>
          <button
            onClick={() => {
              resetTips();
              setTips(loadTips());
            }}
          >
            重新显示所有提示
          </button>
        </div>
      </div>
    </Modal>
  );
}
