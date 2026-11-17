// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ClientRoom } from '../src/net/client';
import { HostRoom } from '../src/net/host';
import { MemoryTransport } from '../src/net/transport';
import { OnlineScreen } from '../src/ui/OnlineScreen';
import { tableSides } from '../src/ui/layout';

afterEach(cleanup);
beforeEach(() => localStorage.clear());

describe('联机界面', () => {
  it('座位布局：任意座位都可以在下方，其余按顺序环绕', () => {
    expect(tableSides(5, 2)).toEqual({ right: [3], top: [4, 0], left: [1] });
    expect(tableSides(2, 1)).toEqual({ right: [], top: [0], left: [] });
  });

  it('建房：显示房间号，有人进来准备后可以开局，开局后显示牌桌', async () => {
    const net = new MemoryTransport();
    render(<OnlineScreen transport={net} onExit={() => {}} />);
    fireEvent.change(screen.getByLabelText('昵称'), { target: { value: '房主甲' } });
    fireEvent.click(screen.getByText('创建房间'));
    const code = (await screen.findByTestId('room-code')).textContent!;
    expect(code).toMatch(/^[A-Z0-9]{6}$/);
    expect(localStorage.getItem('sanguo.online.name')).toBe('房主甲');
    const guest = new ClientRoom(net, code, '乙', 'tok');
    await act(() => guest.connect());
    await screen.findByText('乙');
    expect((screen.getByText('开始游戏') as HTMLButtonElement).disabled).toBe(true);
    await act(async () => guest.setReady(true));
    await waitFor(() => expect((screen.getByText('开始游戏') as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByText('1v1'));
    fireEvent.click(screen.getByText('标准'));
    await waitFor(() => expect(guest.lobby?.settings).toEqual({ players: 2, level: 'normal', timer: 'standard' }));
    fireEvent.click(screen.getByText('开始游戏'));
    // 牌桌出现：中央信息栏显示联机模式；选将时有倒计时
    await screen.findByText(/联机 · 1v1/);
    await waitFor(() => expect(guest.table?.ready).toBe(true));
    const snap = guest.table!.snapshot();
    expect(snap.view.players).toHaveLength(2);
    expect(snap.online?.seats.filter((s) => s.member)).toHaveLength(2);
  });

  it('加入：用链接里的房间号进房，准备，房主开局后显示牌桌', async () => {
    const net = new MemoryTransport();
    const host = new HostRoom(await net.host('ABC234'), '房主', { players: 5, level: 'easy', timer: 'none' }, { aiDelay: 0 });
    render(<OnlineScreen transport={net} initialRoom="ABC234" onExit={() => {}} />);
    fireEvent.change(screen.getByLabelText('昵称'), { target: { value: '客人' } });
    fireEvent.click(screen.getByText('加入房间'));
    await screen.findByText('客人');
    expect(screen.getByText('设置由房主决定。')).toBeTruthy();
    fireEvent.click(screen.getByText('准备'));
    await waitFor(() => expect(host.canStart()).toBe(true));
    act(() => host.start());
    await screen.findByText(/联机 · 5 人身份局/);
    // 房主离开：提示房间关闭
    act(() => host.close());
    await screen.findByText('房主关闭了房间');
  });

  it('房间号不存在时提示', async () => {
    const net = new MemoryTransport();
    render(<OnlineScreen transport={net} onExit={() => {}} />);
    fireEvent.change(screen.getByLabelText('昵称'), { target: { value: '某人' } });
    fireEvent.change(screen.getByLabelText('房间号'), { target: { value: 'zzz999' } });
    fireEvent.click(screen.getByText('加入房间'));
    await screen.findByText('房间 ZZZ999 不存在或房主已离开');
  });
});
