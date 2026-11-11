// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RECORD_VERSION, type GameRecord } from '../src/engine/record';
import { RecordsScreen } from '../src/ui/RecordsScreen';
import { addImported, emptyStats, loadImported, loadRecords, loadStats, removeImported, replaceAll, saveGame } from '../src/ui/storage';
import { backupFile, parseImport, recordFile } from '../src/ui/transfer';

const rec = (id: string, won = true): GameRecord => ({
  version: RECORD_VERSION,
  id,
  date: 1_700_000_000_000,
  seed: 1,
  names: ['你', '一', '二', '三', '四'],
  human: 0,
  answers: [{ seat: 0, r: 'caocao' }],
  winner: 'lord',
  turns: 10,
  role: 'lord',
  general: 'caocao',
  won,
  logLength: 50,
});

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe('导出文件格式', () => {
  it('单局与全量备份都能原样解析回来', () => {
    const r = rec('a');
    expect(parseImport(JSON.stringify(recordFile(r)))).toEqual({ kind: 'record', record: r });
    const stats = emptyStats();
    stats.total = { games: 3, wins: 2 };
    expect(parseImport(JSON.stringify(backupFile([r], stats)))).toEqual({ kind: 'backup', records: [r], stats });
  });

  it('拒绝无效文件并说明原因', () => {
    expect(parseImport('不是 json')).toMatchObject({ kind: 'error', message: expect.stringContaining('JSON') });
    expect(parseImport('{"foo":1}')).toMatchObject({ kind: 'error', message: expect.stringContaining('不是本游戏') });
    const bad = recordFile(rec('a')) as unknown as { record: Record<string, unknown> };
    bad.record.general = 'nobody';
    expect(parseImport(JSON.stringify(bad))).toMatchObject({ kind: 'error' });
    const future = { ...recordFile(rec('a')), version: 99 };
    expect(parseImport(JSON.stringify(future))).toMatchObject({ kind: 'error', message: expect.stringContaining('更新的版本') });
    const noStats = { ...backupFile([], emptyStats()), stats: { total: 1 } };
    expect(parseImport(JSON.stringify(noStats))).toMatchObject({ kind: 'error' });
  });

  it('旧版本记录也可以导入（回放时再提示）', () => {
    const old = { ...rec('old'), version: 1 };
    expect(parseImport(JSON.stringify(recordFile(old)))).toMatchObject({ kind: 'record' });
  });
});

describe('导入的存储', () => {
  it('导入的回放单独存放、去重、最多 20 局，不影响自己的记录与战绩', () => {
    saveGame(rec('mine'));
    for (let i = 0; i < 25; i++) addImported(rec(`x${i}`));
    addImported(rec('x24'));
    const list = loadImported();
    expect(list).toHaveLength(20);
    expect(list[0].id).toBe('x24');
    expect(loadRecords().map((r) => r.id)).toEqual(['mine']);
    expect(loadStats().total.games).toBe(1);
    expect(removeImported('x24').map((r) => r.id)).not.toContain('x24');
  });

  it('全量备份替换自己的记录与战绩，导入的回放保留', () => {
    saveGame(rec('mine'));
    addImported(rec('theirs'));
    const stats = emptyStats();
    stats.total = { games: 9, wins: 4 };
    replaceAll([rec('b1'), rec('b2')], stats);
    expect(loadRecords().map((r) => r.id)).toEqual(['b1', 'b2']);
    expect(loadStats().total).toEqual({ games: 9, wins: 4 });
    expect(loadImported().map((r) => r.id)).toEqual(['theirs']);
  });
});

describe('对局记录界面', () => {
  const tick = () => act(() => new Promise((r) => setTimeout(r, 0)));
  const upload = async (content: unknown) => {
    const file = new File([JSON.stringify(content)], 'x.json', { type: 'application/json' });
    fireEvent.change(screen.getByLabelText('导入文件'), { target: { files: [file] } });
    for (let i = 0; i < 10; i++) await tick();
  };

  it('导出全部 / 单局会下载文件', () => {
    saveGame(rec('mine'));
    const create = vi.fn(() => 'blob:x');
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(<RecordsScreen onBack={() => {}} onReplay={() => {}} />);
    fireEvent.click(screen.getByText('导出全部'));
    fireEvent.click(screen.getByText('导出'));
    expect(create).toHaveBeenCalledTimes(2);
    expect(click).toHaveBeenCalledTimes(2);
    click.mockRestore();
  });

  it('导入单局：出现在「导入的回放」中，可回放、删除', async () => {
    const onReplay = vi.fn();
    render(<RecordsScreen onBack={() => {}} onReplay={onReplay} />);
    await upload(recordFile(rec('shared')));
    expect(screen.getByText(/已导入 1 局回放/)).toBeTruthy();
    expect(screen.getByText('导入')).toBeTruthy();
    fireEvent.click(screen.getByText('回放'));
    expect(onReplay).toHaveBeenCalledWith(expect.objectContaining({ id: 'shared' }));
    fireEvent.click(screen.getByText('删除'));
    expect(screen.queryByText('导入')).toBeNull();
    expect(loadStats().total.games).toBe(0);
  });

  it('导入全量备份：先确认，取消不改动，确定后替换', async () => {
    saveGame(rec('mine'));
    const stats = emptyStats();
    stats.total = { games: 7, wins: 3 };
    render(<RecordsScreen onBack={() => {}} onReplay={() => {}} />);
    await upload(backupFile([rec('b1'), rec('b2')], stats));
    expect(screen.getByText(/这是一份全量备份/)).toBeTruthy();
    fireEvent.click(screen.getByText('取消'));
    expect(loadRecords().map((r) => r.id)).toEqual(['mine']);
    await upload(backupFile([rec('b1'), rec('b2')], stats));
    fireEvent.click(screen.getByText('确定替换'));
    expect(loadRecords().map((r) => r.id)).toEqual(['b1', 'b2']);
    expect(document.body.textContent).toMatch(/共 7 局/);
  });

  it('导入无效文件显示错误', async () => {
    render(<RecordsScreen onBack={() => {}} onReplay={() => {}} />);
    await upload({ hello: 1 });
    expect(screen.getByText(/导入失败/)).toBeTruthy();
  });
});
