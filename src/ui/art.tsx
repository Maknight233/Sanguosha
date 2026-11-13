/**
 * 水墨印章风的程序生成美术：武将头像与卡面。
 * 全部是内联 SVG，不需要图片文件；武将 / 卡牌数据里填了 image 时优先用图片。
 * 纹样分两类：长兵器（沿 x 轴 0…106 横放，使用时旋转成对角线）与徽记（以原点为中心的 ±50 方框）。
 */
import type { ReactNode } from 'react';
import type { CardKind } from '../engine/types';

const INK = '#1d1a17';
const KAI = '"KaiTi","STKaiti","Kaiti SC","楷体",serif';
export const FACTION_COLOR: Record<string, string> = { wei: '#3a5a9a', shu: '#3f8a4a', wu: '#b03a2e', qun: '#7a6a55' };
const FACTION_CHAR: Record<string, string> = { wei: '魏', shu: '蜀', wu: '吴', qun: '群' };
const KIND_COLOR: Record<CardKind, string> = { basic: '#b03a2e', trick: '#6a4c93', equip: '#2c6e8f' };

// ───────────── 纹样 ─────────────

type Motif = { long?: boolean; draw: ReactNode };
const shaft = (to: number) => <rect x="0" y="-1.6" width={to} height="3.2" rx="1.6" />;
const butt = <path d="M-2,0 l-6,-3.5 l0,7 z" />;

const sword = (
  <>
    <path d="M24,-4 L98,-2.2 L106,0 L98,2.2 L24,4 Z" />
    <rect x="19" y="-10" width="5" height="20" rx="2" />
    <rect x="5" y="-2.6" width="15" height="5.2" rx="2" />
    <circle cx="3" cy="0" r="4" />
  </>
);

const ARMOR_SHAPE = 'M-40,-36 L-16,-44 C-8,-34 8,-34 16,-44 L40,-36 L34,-8 L26,-12 L26,46 L-26,46 L-26,-12 L-34,-8 Z';

const MOTIFS: Record<string, Motif> = {
  glaive: {
    long: true,
    draw: (
      <>
        {shaft(76)}
        {butt}
        <path d="M70,-2 C78,-21 98,-24 106,-9 C97,-14 87,-10 83,2 L70,2 Z" />
        <rect x="66" y="-4" width="4" height="8" />
      </>
    ),
  },
  spear: {
    long: true,
    draw: (
      <>
        {shaft(84)}
        {butt}
        <path d="M82,0 L91,-6 L106,0 L91,6 Z" />
        <path d="M78,-2 q-6,8 -1,14 q5,-6 4,-14 z" />
      </>
    ),
  },
  serpent: {
    long: true,
    draw: (
      <>
        {shaft(70)}
        {butt}
        <path d="M68,-3 C75,-12 81,5 88,-5 C93,-11 99,-3 106,0 C99,3 93,11 88,5 C81,-5 75,12 68,3 Z" />
      </>
    ),
  },
  halberd: {
    long: true,
    draw: (
      <>
        {shaft(86)}
        {butt}
        <path d="M84,-4 L106,0 L84,4 Z" />
        <path d="M66,-2 C68,-22 88,-24 92,-8 C86,-14 77,-12 76,-2 Z" />
        <path d="M70,2 l10,0 l-5,9 z" />
      </>
    ),
  },
  sword: { long: true, draw: sword },
  saber: {
    long: true,
    draw: (
      <>
        <rect x="2" y="-2.6" width="20" height="5.2" rx="2" />
        <circle cx="2" cy="0" r="4.5" fill="none" stroke="currentColor" strokeWidth="2.5" />
        <rect x="21" y="-9" width="4" height="18" rx="2" />
        <path d="M25,-5 L80,-9 C93,-10 102,-4 106,5 C95,2 60,6 25,5 Z" />
      </>
    ),
  },
  bow: {
    draw: (
      <g fill="none" stroke="currentColor" strokeLinecap="round">
        <path d="M-14,-44 C36,-30 36,30 -14,44" strokeWidth="6" />
        <path d="M-14,-44 L-14,44" strokeWidth="1.6" />
        <path d="M-34,0 L40,0" strokeWidth="3" />
        <path d="M40,0 l-12,-6 M40,0 l-12,6 M-34,0 l-6,-5 M-34,0 l-6,5" strokeWidth="3" />
      </g>
    ),
  },
  fan: {
    draw: (
      <>
        {[-56, -34, -12, 10, 32, 54].map((a) => (
          <ellipse key={a} cx="0" cy="-30" rx="9" ry="26" transform={`rotate(${a} 0 14)`} />
        ))}
        <rect x="-3" y="12" width="6" height="34" rx="3" />
        <circle cx="0" cy="14" r="7" />
      </>
    ),
  },
  scroll: {
    draw: (
      <>
        {[-36, -24, -12, 0, 12, 24, 36].map((x) => (
          <rect key={x} x={x - 4.5} y="-34" width="9" height="68" rx="2" />
        ))}
        <rect x="-44" y="-20" width="88" height="3" fill="#f3ead2" />
        <rect x="-44" y="17" width="88" height="3" fill="#f3ead2" />
      </>
    ),
  },
  gourd: {
    draw: (
      <>
        <circle cx="0" cy="18" r="26" />
        <circle cx="0" cy="-18" r="16" />
        <rect x="-3" y="-44" width="6" height="14" rx="2" />
        <path d="M0,-40 q16,-6 18,8" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </>
    ),
  },
  staff: {
    draw: (
      <>
        <rect x="-4" y="-26" width="8" height="76" rx="4" />
        <path d="M0,-24 C-34,-30 -36,10 -10,8 C8,6 6,-16 -10,-14" fill="none" stroke="currentColor" strokeWidth="8" strokeLinecap="round" />
        <path d="M10,-30 L36,-30 L36,16 L23,10 L10,16 Z" />
        <path d="M16,-18 L30,-18 M16,-8 L30,-8 M16,2 L30,2" stroke="#f3ead2" strokeWidth="2.5" />
      </>
    ),
  },
  shield: {
    draw: (
      <>
        <path d="M-34,-40 L34,-40 L34,6 C34,28 18,42 0,48 C-18,42 -34,28 -34,6 Z" />
        <circle cx="0" cy="-2" r="12" fill="#f3ead2" />
        <circle cx="0" cy="-2" r="5" />
      </>
    ),
  },
  flag: {
    draw: (
      <>
        <rect x="-34" y="-46" width="5" height="94" rx="2.5" />
        <path d="M-29,-42 C-8,-52 8,-32 38,-42 L30,-22 L38,-4 C8,6 -8,-14 -29,-4 Z" />
      </>
    ),
  },
  flame: {
    draw: <path d="M0,-48 C6,-28 30,-18 26,10 C24,34 8,46 0,46 C-12,46 -28,34 -26,12 C-25,-2 -14,-8 -12,-22 C-4,-16 -2,-8 -2,2 C8,-10 4,-30 0,-48 Z" />,
  },
  moon: {
    draw: (
      <>
        <path d="M10,-42 A42,42 0 1 0 10,42 A60,60 0 0 1 10,-42 Z" />
        <path d="M-40,34 C-10,20 10,48 44,30" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      </>
    ),
  },
  slash: { draw: <path d="M-42,46 C-18,2 8,-28 44,-48 C22,-12 0,22 -30,50 Z" /> },
  cloud: {
    draw: (
      <g fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round">
        <path d="M-40,10 C-40,-14 -8,-14 -8,4 C-8,16 -26,14 -24,4" />
        <path d="M-8,4 C-6,-30 40,-28 38,0 C36,18 12,16 14,2" />
        <path d="M-44,30 L44,30" />
      </g>
    ),
  },
  bolt: { draw: <path d="M10,-50 L-26,6 L-4,6 L-14,50 L28,-10 L4,-10 Z" /> },
  sack: {
    draw: (
      <>
        <path d="M-22,-22 C-40,0 -38,44 0,44 C38,44 40,0 22,-22 Z" />
        <path d="M-16,-26 L-24,-44 L0,-36 L24,-44 L16,-26 Z" />
        <rect x="-18" y="-28" width="36" height="6" rx="3" fill="#f3ead2" />
      </>
    ),
  },
  token: {
    draw: (
      <>
        <path d="M-24,-30 L0,-48 L24,-30 L24,46 L-24,46 Z" />
        <circle cx="0" cy="-28" r="5" fill="#f3ead2" />
        <rect x="-12" y="-10" width="24" height="42" rx="2" fill="none" stroke="#f3ead2" strokeWidth="2.5" />
      </>
    ),
  },
  eye: {
    draw: (
      <>
        <path d="M-48,0 C-24,-34 24,-34 48,0 C24,34 -24,34 -48,0 Z" fill="none" stroke="currentColor" strokeWidth="6" />
        <circle cx="0" cy="0" r="15" />
      </>
    ),
  },
  tent: {
    draw: (
      <>
        <path d="M0,-40 L46,40 L-46,40 Z" />
        <path d="M0,-2 L14,40 L-14,40 Z" fill="#f3ead2" />
        <path d="M0,-40 L0,-50 L14,-45 Z" />
      </>
    ),
  },
  duel: {
    draw: (
      <>
        <g transform="rotate(-45) translate(-55,0)">{sword}</g>
        <g transform="rotate(-135) translate(-55,0)">{sword}</g>
      </>
    ),
  },
  hammer: {
    draw: (
      <>
        <circle cx="22" cy="22" r="22" />
        {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
          <path key={a} d="M22,-6 l-4,8 l8,0 z" transform={`rotate(${a} 22 22)`} />
        ))}
        <path d="M6,6 C-10,-6 -18,-18 -40,-40" fill="none" stroke="currentColor" strokeWidth="5" strokeDasharray="5 5" strokeLinecap="round" />
        <circle cx="-42" cy="-42" r="6" />
      </>
    ),
  },
  scaleArmor: {
    draw: (
      <>
        <path d={ARMOR_SHAPE} />
        <g fill="none" stroke="#f3ead2" strokeWidth="2">
          {[-4, 10, 24, 38].map((y, r) =>
            [-20, -8, 4, 16].map((x) => <path key={`${x},${y}`} d={`M${x + (r % 2) * 6 - 6},${y} a6,6 0 0 0 12,0`} />),
          )}
        </g>
      </>
    ),
  },
  chainArmor: {
    draw: (
      <>
        <path d={ARMOR_SHAPE} />
        <g fill="none" stroke="#f3ead2" strokeWidth="1.8">
          {[-2, 10, 22, 34].map((y, r) =>
            [-18, -6, 6, 18].map((x) => <circle key={`${x},${y}`} cx={x + (r % 2 ? 6 : 0) - 3} cy={y} r="4.5" />),
          )}
        </g>
      </>
    ),
  },
  mirror: {
    draw: (
      <>
        <circle cx="0" cy="0" r="42" />
        <circle cx="0" cy="0" r="30" fill="none" stroke="#f3ead2" strokeWidth="3" />
        <circle cx="0" cy="0" r="8" fill="#f3ead2" />
      </>
    ),
  },
  qin: {
    draw: (
      <>
        <path d="M-50,-8 C-50,-16 -40,-18 -30,-16 L44,-6 C50,-5 52,4 46,6 L-30,16 C-42,18 -50,12 -50,4 Z" />
        <g stroke="#f3ead2" strokeWidth="1.2">
          <path d="M-40,-8 L40,-2 M-40,-2 L40,1 M-40,4 L40,4 M-40,10 L40,7" />
        </g>
        <path d="M-20,22 C-6,30 10,30 22,22 M-10,34 C0,40 12,38 20,32" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </>
    ),
  },
  lotus: {
    draw: (
      <>
        <path d="M0,-44 C14,-26 14,-2 0,14 C-14,-2 -14,-26 0,-44 Z" />
        <path d="M-6,14 C-34,6 -40,-20 -34,-34 C-18,-26 -6,-8 -6,14 Z" />
        <path d="M6,14 C34,6 40,-20 34,-34 C18,-26 6,-8 6,14 Z" />
        <path d="M-40,22 C-20,12 20,12 40,22 C20,30 -20,30 -40,22 Z" />
        <rect x="-2.5" y="26" width="5" height="22" rx="2.5" />
      </>
    ),
  },
  claw: {
    draw: (
      <>
        <path d="M-30,-44 C-18,-14 -18,16 -34,44 C-24,18 -26,-12 -36,-40 Z" />
        <path d="M-2,-48 C10,-16 10,16 -6,48 C4,18 2,-14 -8,-44 Z" />
        <path d="M26,-44 C38,-14 38,16 22,44 C32,18 30,-12 20,-40 Z" />
      </>
    ),
  },
  weiqi: {
    draw: (
      <>
        <rect x="-44" y="-44" width="88" height="88" rx="4" />
        <g stroke="#f3ead2" strokeWidth="1.4">
          <path d="M-33,-33 V33 M-11,-33 V33 M11,-33 V33 M33,-33 V33 M-33,-33 H33 M-33,-11 H33 M-33,11 H33 M-33,33 H33" />
        </g>
        <circle cx="-11" cy="-11" r="8" fill="#f3ead2" />
        <circle cx="11" cy="11" r="8" fill="#f3ead2" />
        <circle cx="11" cy="-11" r="8" stroke="#f3ead2" strokeWidth="2" />
      </>
    ),
  },
  helmet: {
    draw: (
      <>
        <path d="M-40,20 C-42,-18 -22,-40 0,-40 C22,-40 42,-18 40,20 L28,20 L28,4 L-28,4 L-28,20 Z" />
        <path d="M0,-40 L0,-58 M-8,-56 L8,-56" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
        <path d="M-44,20 L44,20 L36,34 L-36,34 Z" />
        <path d="M-6,4 L-6,30 L6,30 L6,4 Z" fill="#f3ead2" />
      </>
    ),
  },
  brush: {
    draw: (
      <>
        <rect x="-5" y="-50" width="10" height="64" rx="3" transform="rotate(30)" />
        <path d="M-2,14 C8,24 6,40 -10,52 C-14,40 -18,26 -10,16 Z" transform="rotate(30)" />
        <path d="M-46,40 C-20,30 0,44 24,36 C34,32 42,34 48,40" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      </>
    ),
  },
  horse: {
    draw: (
      <>
        <path d="M-34,48 C-40,22 -34,-2 -18,-20 L-22,-46 L-6,-32 C4,-40 18,-42 28,-34 C38,-26 46,-10 48,0 C50,8 44,13 36,11 C28,9 20,7 14,11 C6,18 4,32 8,48 Z" />
        <path d="M-18,-20 C-30,-10 -38,4 -42,20 M-12,-14 C-26,-2 -32,12 -36,30" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
        <circle cx="16" cy="-16" r="3.5" fill="#f3ead2" />
        <path d="M40,-30 L52,-36 M42,-18 L56,-20" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </>
    ),
  },
  horseshoe: {
    draw: (
      <g fill="none" stroke="currentColor" strokeLinecap="round">
        <path d="M-26,40 C-56,-10 -30,-44 0,-44 C30,-44 56,-10 26,40" strokeWidth="15" />
        <path d="M-27,22 l0,0 M-34,-6 l0,0 M-18,-30 l0,0 M18,-30 l0,0 M34,-6 l0,0 M27,22 l0,0" stroke="#f3ead2" strokeWidth="4" />
      </g>
    ),
  },
};

const GENERAL_MOTIF: Record<string, string> = {
  guanyu: 'glaive',
  zhaoyun: 'spear',
  machao: 'spear',
  zhangliao: 'spear',
  zhangfei: 'serpent',
  lvbu: 'halberd',
  dianwei: 'halberd',
  ganning: 'halberd',
  caocao: 'sword',
  liubei: 'sword',
  sunquan: 'sword',
  zhouyu: 'sword',
  weiyan: 'saber',
  huaxiong: 'saber',
  xiahoudun: 'saber',
  zhoutai: 'saber',
  lvmeng: 'saber',
  huangzhong: 'bow',
  taishici: 'bow',
  zhugeliang: 'fan',
  luxun: 'fan',
  guojia: 'scroll',
  xunyu: 'scroll',
  lusu: 'scroll',
  simayi: 'scroll',
  huatuo: 'gourd',
  zhangjiao: 'staff',
  yuji: 'staff',
  caoren: 'shield',
  gongsunzan: 'flag',
  dongzhuo: 'flame',
  diaochan: 'moon',
  caiwenji: 'qin',
  daqiao: 'lotus',
  mizhu: 'sack',
  pangde: 'saber',
  xuchu: 'claw',
  fazheng: 'weiqi',
  chengpu: 'helmet',
  jiaxu: 'brush',
};

const CARD_MOTIF: Record<string, string> = {
  zhan: 'slash',
  bi: 'cloud',
  yao: 'gourd',
  tiaobing: 'flag',
  jieying: 'tent',
  cefan: 'scroll',
  xiwen: 'flame',
  biwu: 'duel',
  xiuzheng: 'moon',
  duanliang: 'sack',
  junling: 'token',
  tianlei: 'bolt',
  shipo: 'eye',
  huanshoudao: 'saber',
  tiejiqiang: 'spear',
  bintieji: 'halberd',
  liuxingchui: 'hammer',
  shenbigong: 'bow',
  yulinjia: 'scaleArmor',
  suozijia: 'chainArmor',
  shoumiandun: 'shield',
  huxinjing: 'mirror',
  qiji: 'horse',
  hualiu: 'horse',
  qingcong: 'horseshoe',
  huangbiao: 'horseshoe',
};

export const hasGeneralArt = (key: string) => key in GENERAL_MOTIF;
export const hasCardArt = (key: string) => key in CARD_MOTIF;

/** 把纹样放进以 (cx, cy) 为中心、约 size 大小的区域；长兵器沿对角线摆放 */
function place(m: Motif, cx: number, cy: number, size: number, angle = -38): ReactNode {
  const s = size / 106;
  return m.long ? (
    <g transform={`translate(${cx},${cy}) rotate(${angle}) scale(${s}) translate(-50,0)`}>{m.draw}</g>
  ) : (
    <g transform={`translate(${cx},${cy}) scale(${s})`}>{m.draw}</g>
  );
}

// ───────────── 武将头像 ─────────────

/** 武将头像：宣纸底、淡墨远山、兵器 / 象征物的墨色纹样、毛笔字姓名、势力色印章 */
export function GeneralArt({ general, name, faction }: { general: string; name: string; faction: string }) {
  const m = MOTIFS[GENERAL_MOTIF[general] ?? 'sword'];
  const color = FACTION_COLOR[faction] ?? FACTION_COLOR.qun;
  const three = name.length >= 3;
  const size = three ? 64 : 76;
  // 长兵器斜贯全图，名字居中；徽记靠左，名字略偏右（三字名时徽记缩小让位）
  const nameX = m.long ? 142 : three ? 160 : 182;
  return (
    <svg className="general-art" viewBox="0 0 300 180" preserveAspectRatio="xMidYMid slice" role="img" aria-label={name}>
      <defs>
        <radialGradient id="ink-paper" cx="50%" cy="40%" r="80%">
          <stop offset="0" stopColor="#f7f0dc" />
          <stop offset="1" stopColor="#dccfae" />
        </radialGradient>
        <filter id="ink-blur">
          <feGaussianBlur stdDeviation="5" />
        </filter>
      </defs>
      <rect width="300" height="180" fill="url(#ink-paper)" />
      <g filter="url(#ink-blur)" opacity=".45">
        <path d="M-10,150 C40,90 70,120 110,84 C140,60 170,110 210,92 C250,74 280,110 320,96 L320,190 L-10,190 Z" fill="#6f6a5f" />
        <path d="M-10,170 C60,130 120,160 180,134 C230,114 270,150 320,138 L320,190 L-10,190 Z" fill="#3b3833" />
      </g>
      <g color={INK} fill={INK} opacity=".4">
        {m.long ? place(m, 150, 92, 250, -30) : three ? place(m, 38, 90, 66) : place(m, 50, 90, 88)}
      </g>
      <text x={nameX} y={90 + size * 0.34} textAnchor="middle" fontFamily={KAI} fontSize={size} fontWeight="bold" fill={INK}>
        {name}
      </text>
      <g transform="translate(261,46) rotate(4)">
        <rect width="34" height="34" rx="4" fill={color} />
        <rect x="3" y="3" width="28" height="28" rx="2" fill="none" stroke="#f7f0dc" strokeWidth="1.5" />
        <text x="17" y="26" textAnchor="middle" fontFamily={KAI} fontSize="24" fill="#f7f0dc">
          {FACTION_CHAR[faction] ?? '群'}
        </text>
      </g>
    </svg>
  );
}

// ───────────── 卡面 ─────────────

/** 卡面：宣纸底、按类型着色的淡彩纹样、毛笔字牌名（两字以上竖排）。花色点数与类型由外层卡牌显示 */
export function CardArt({ cardKey, name, kind }: { cardKey: string; name: string; kind: CardKind }) {
  const m = MOTIFS[CARD_MOTIF[cardKey] ?? 'slash'];
  const color = KIND_COLOR[kind];
  const n = name.length;
  const size = n === 1 ? 84 : n === 2 ? 58 : n === 3 ? 46 : 38;
  return (
    <svg className="card-art-svg" viewBox="0 0 156 224" preserveAspectRatio="xMidYMid slice" role="img" aria-label={name}>
      <defs>
        <radialGradient id="ink-card" cx="50%" cy="35%" r="85%">
          <stop offset="0" stopColor="#fbf6e6" />
          <stop offset="1" stopColor="#e6dabd" />
        </radialGradient>
      </defs>
      <rect width="156" height="224" fill="url(#ink-card)" />
      <g color={color} fill={color} opacity=".3">
        {m.long ? place(m, 78, 116, 170, -52) : place(m, 78, 116, 124)}
      </g>
      {n === 1 ? (
        <text x="78" y={116 + size * 0.36} textAnchor="middle" fontFamily={KAI} fontSize={size} fontWeight="bold" fill={INK}>
          {name}
        </text>
      ) : (
        <text
          x="78"
          y="116"
          textAnchor="middle"
          fontFamily={KAI}
          fontSize={size}
          fontWeight="bold"
          fill={INK}
          style={{ writingMode: 'vertical-rl' }}
        >
          {name}
        </text>
      )}
    </svg>
  );
}
