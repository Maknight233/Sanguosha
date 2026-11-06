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

const SKILL_NAME: Record<string, string> = { kuanren: '宽仁', huoji: '火计', huoxin: '惑心', baodao: '宝刀', lianmeng: '联盟', fencheng: '焚城', qixi: '奇袭', dujiang: '渡江' };
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
      return `${req.reason === 'jieying' ? '【劫营】弃置' : '【策反】获得'} ${name(view, req.target)} 的一张牌`;
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
      }
      break;
    case 'orderCards':
      return '【谋算】：依次点击，决定放回牌堆顶的顺序（先点的在最上面）';
    case 'respond': {
      const r = req.reason;
      const pair = req.allowPair ? '（可用【铁脊长枪】将两张同颜色手牌当【避】）' : '';
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
