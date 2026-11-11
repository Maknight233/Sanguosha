// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CARD_DEFS } from '../src/data/cards';
import { GENERAL_KEYS, GENERALS } from '../src/data/generals';
import { hasCardArt, hasGeneralArt } from '../src/ui/art';
import { CardView, GeneralCard } from '../src/ui/components';
import { InkSplash } from '../src/ui/effects';

afterEach(cleanup);

describe('水墨美术', () => {
  it('每名武将、每种牌都有纹样', () => {
    expect(GENERAL_KEYS.filter((k) => !hasGeneralArt(k))).toEqual([]);
    expect(Object.keys(CARD_DEFS).filter((k) => !hasCardArt(k))).toEqual([]);
  });

  it('武将卡与卡牌显示生成的 SVG，并带可读的名字', () => {
    const { container } = render(
      <>
        <GeneralCard general="guanyu" />
        <CardView card={{ id: 1, key: 'tiejiqiang', suit: 'spade', rank: 7 }} />
      </>,
    );
    expect(container.querySelector('svg.general-art')?.getAttribute('aria-label')).toBe('关羽');
    expect(container.querySelector('svg.card-art-svg')?.textContent).toBe('铁脊长枪');
  });

  it('数据里填了 image 时优先用图片', () => {
    const g = GENERALS.guanyu;
    g.image = '/art/guanyu.png';
    try {
      const { container } = render(<GeneralCard general="guanyu" />);
      expect(container.querySelector('.general-portrait img')?.getAttribute('src')).toBe('/art/guanyu.png');
      expect(container.querySelector('svg.general-art')).toBeNull();
    } finally {
      delete g.image;
    }
  });
});

describe('水墨动效', () => {
  it('墨点形状由 seed 决定，重伤时飞溅更多', () => {
    const html = (seed: number, heavy = false) => render(<InkSplash seed={seed} heavy={heavy} />).container.innerHTML;
    expect(html(5)).toBe(html(5));
    expect(html(5)).not.toBe(html(6));
    const { container } = render(<InkSplash seed={5} heavy />);
    expect(container.querySelectorAll('circle')).toHaveLength(11);
  });
});
