import { cardDef, cardText } from '../data/cards';
import { generalDef } from '../data/generals';
import type { GameView, JudgeInfo, Request } from '../engine/types';

function judgeName(view: GameView, j: JudgeInfo | undefined): string {
  if (!j) return '';
  const what = j.what === 'qixi' ? '【奇袭】' : j.what ? `【${cardDef(j.what).name}】` : '';
  return `${name(view, j.seat)} 的${what}判定牌为 ${cardText(j.result)}`;
}

function name(view: GameView, seat: number): string {
  const p = view.players[seat];
  if (seat === view.me) return '你';
  return p.general ? `${p.name}（${generalDef(p.general).name}）` : p.name;
}

const SKILL_NAME: Record<string, string> = { kuanren: '宽仁', huoji: '火计', huoxin: '惑心', baodao: '宝刀', lianmeng: '联盟', fencheng: '焚城', qixi: '奇袭', dujiang: '渡江', duoxie: '夺械', yinrenDraw: '隐忍·摸牌', yinrenHit: '隐忍·重创', fushang: '抚伤', jikun: '济困', bohu: '搏虎', qimou: '奇谋', laojiang: '老将', luance: '乱策' };
export function skillName(key: string): string {
  return SKILL_NAME[key] ?? key;
}

/** 把引擎请求翻译成给玩家看的中文提示 */
export function describeRequest(view: GameView, req: Request): string {
  switch (req.type) {
    case 'chooseGeneral':
      return '请选择你的武将';
    case 'play':
      return '出牌阶段：选择一张牌或技能，或结束出牌';
    case 'discard':
      return `弃牌阶段：请弃置 ${req.count} 张手牌`;
    case 'chooseCard':
      return `${{ jieying: '【劫营】弃置', cefan: '【策反】获得', liuxing: '【流星锤】：令其弃置', laojiang: '【老将】弃置' }[req.reason]} ${name(view, req.target)} 的一张牌`;
    case 'choose':
      return {
        xiuzheng: '【休整】：请选择',
        xiandeng: '是否发动【先登】？',
        jinfan: '是否发动【锦帆】？',
        yangsheng: '是否发动【养生】？选择要弃置的手牌',
        sheshen: `是否发动【舍身】，代替 ${req.target === undefined ? '' : name(view, req.target)} 承受伤害？`,
        dingce: `${judgeName(view, req.judge)}，是否发动【定策】打出一张手牌代替？`,
        bushi: `${judgeName(view, req.judge)}，是否发动【卜筮】获得之？`,
        qixi: '【奇袭】判定为黑色：选择一名距离为 1 的角色，视为对其使用【斩】',
        bashi: `是否发动【拔矢】，弃置一张手牌，对 ${req.target === undefined ? '' : name(view, req.target)} 造成 1 点伤害？`,
        qingyin: `${req.target === undefined ? '' : name(view, req.target)} 进入濒死状态，是否发动【清音】弃置一张手牌，令其回复 1 点体力？`,
        yinren: '你进入濒死状态，是否发动【隐忍】？（亮出内奸身份，回复至 1 点体力，防止所有伤害直到你的回合开始）',
        liuxing: `${req.target === undefined ? '' : name(view, req.target)} 抵消了你的【斩】，是否发动【流星锤】弃置一张手牌，令其弃置一张牌？`,
      }[req.reason];
    case 'selectCards':
      switch (req.reason) {
        case 'mousuan':
          return '【谋算】：选择 1 张牌获得';
        case 'shensuan':
          return `【神算】：选择 ${req.count} 张牌获得，其余置于牌堆底`;
        case 'xiaoyong':
          return '【骁勇】：选择要弃置的装备';
        case 'huoxin':
          return '【惑心】：选择一张手牌交给貂蝉';
        case 'duoxie':
          return '【夺械】：选择要获得的装备';
        case 'pindian': {
          const info = req.pindian;
          if (!info) return '拼点：选择一张手牌';
          const skill = { bohu: '搏虎', qimou: '奇谋', laojiang: '老将', luance: '乱策' }[info.skill] ?? info.skill;
          const role = info.initiator ? '你是发起者，点数须大于对方才算赢' : '对方是发起者，平局算你赢';
          return `【${skill}】与 ${name(view, info.opponent)} 拼点：选择一张手牌（${role}）`;
        }
      }
      break;
    case 'orderCards':
      return '【谋算】：依次点击，决定放回牌堆顶的顺序（先点的在最上面）';
    case 'respond': {
      const r = req.reason;
      const pair =
        (req.allowPair ? '（可用【铁脊长枪】将两张同颜色手牌当【避】）' : '') + (req.equipDodge?.length ? '（可发动【死战】将装备区的牌当【避】）' : '');
      switch (r.kind) {
        case 'dodge':
          return `${name(view, r.source)} 对你使用了【斩】，是否打出【避】？${pair}`;
        case 'haoling':
          return `【号令】：是否替主公 ${name(view, r.lord)} 打出【避】？`;
        case 'save':
          return r.dying === view.me
            ? '你进入濒死状态！是否使用【药】？'
            : `${name(view, r.dying)} 进入濒死状态，是否对其使用【药】？`;
        case 'shipo': {
          const trick = cardDef(r.trick).name;
          return r.countering
            ? `有人用【识破】抵消了【${trick}】，是否再用【识破】抵消它？`
            : r.trick === 'tianlei'
              ? `${name(view, r.target)} 判定区的【天雷】即将判定，是否打出【识破】？（抵消后它会移到下家）`
              : cardDef(r.trick).delayed
              ? `${name(view, r.target)} 判定区的【${trick}】（${name(view, r.user)} 使用）即将判定，是否打出【识破】？`
              : `${name(view, r.user)} 对 ${name(view, r.target)} 使用了【${trick}】，是否打出【识破】？`;
        }
        case 'xiwen':
          return `${name(view, r.source)} 使用了【檄文】，是否弃置一张基础牌？不弃将受到 1 点伤害`;
        case 'biwu':
          return `【比武】：是否弃置一张【斩】？不弃将受到 ${name(view, r.opponent)} 造成的 1 点伤害`;
        case 'yulin':
          return '【鱼鳞甲】：是否弃置一张基础牌防止此伤害？';
        case 'huoxin':
          return `【惑心】：是否对 ${name(view, r.victim)} 使用【斩】？否则须交给 ${name(view, r.from)} 一张手牌`;
      }
    }
  }
  return '';
}
