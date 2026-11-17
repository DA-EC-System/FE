// Vòng hỏi lại lượt tải SKU sàn (FE#265, BE#361; Documents/21 §18.3). Chạy bằng QueryObserver, bộ máy bên dưới useQuery,
// với đồng hồ giả: hỏi theo Retry-After / 3 giây, xong thì nạp lại danh sách và thôi hỏi, quá 10 phút thì thôi hỏi
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RemoteSkuList, RemoteSkusRefresh } from '@/types/shop';

// react-query coi môi trường không có `window` là server và tắt refetchInterval: dựng window giả trước khi import
vi.hoisted(() => {
  (globalThis as Record<string, unknown>).window ??= { addEventListener() {}, removeEventListener() {} };
});

const get = vi.hoisted(() => vi.fn());
vi.mock('./client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./client')>()),
  apiClient: { get, post: vi.fn() },
}));

const { applyRefreshResult, remoteSkusRefreshOptions, shopKeys, REMOTE_REFRESH_LIMIT_MS } = await import('./shops.api');

const COMPANY = 'cty-1';
const SHOP = 'shop-1';
const STARTED = '2026-11-17T08:00:00Z';
const listKey = shopKeys.remoteSkus(COMPANY, SHOP);

const luot = (status: RemoteSkusRefresh['status']): RemoteSkusRefresh => ({
  status,
  startedAt: STARTED,
  finishedAt: status === 'running' ? null : '2026-11-17T08:01:00Z',
  error: null,
});
const tra = (status: RemoteSkusRefresh['status'], headers: Record<string, string> = {}) => ({
  data: { refresh: luot(status) },
  headers,
});

let queryClient: QueryClient;
let stop: () => void = () => undefined;

function hoi(startedAt: string | null = STARTED) {
  const observer = new QueryObserver(queryClient, remoteSkusRefreshOptions(queryClient, COMPANY, SHOP, startedAt));
  stop = observer.subscribe(() => undefined);
  return observer;
}

beforeEach(() => {
  vi.useFakeTimers();
  get.mockReset();
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData<RemoteSkuList>(listKey, { syncedAt: null, items: [], refresh: luot('running') });
});

afterEach(() => {
  stop();
  queryClient.clear();
  vi.useRealTimers();
});

describe('useRemoteSkusRefresh: hỏi lại khi lượt đang chạy', () => {
  it('hỏi theo Retry-After của BE', async () => {
    get.mockResolvedValue(tra('running', { 'retry-after': '5' }));
    hoi();
    await vi.advanceTimersByTimeAsync(0);
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith(`/channel/shops/${SHOP}/remote-skus/refresh`);
    await vi.advanceTimersByTimeAsync(4_900);
    expect(get).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(200);
    expect(get).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(get).toHaveBeenCalledTimes(3);
  });

  it('không có Retry-After thì hỏi mỗi 3 giây', async () => {
    get.mockResolvedValue(tra('running'));
    hoi();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(2_900);
    expect(get).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(200);
    expect(get).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(9_000);
    expect(get).toHaveBeenCalledTimes(5);
  });

  it.each(['succeeded', 'failed'] as const)('lượt %s: ghi vào bản sao, nạp lại remote-skus, thôi hỏi', async (status) => {
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    get.mockResolvedValueOnce(tra('running')).mockResolvedValue(tra(status));
    hoi();
    await vi.advanceTimersByTimeAsync(0);
    expect(invalidate).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(3_000);
    expect(get).toHaveBeenCalledTimes(2);
    expect(queryClient.getQueryData<RemoteSkuList>(listKey)?.refresh?.status).toBe(status);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: listKey });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('quá 10 phút vẫn chạy: stuck và thôi hỏi', async () => {
    get.mockResolvedValue(tra('running'));
    const observer = hoi();
    await vi.advanceTimersByTimeAsync(REMOTE_REFRESH_LIMIT_MS - 3_000);
    expect(observer.getCurrentResult().data?.stuck).toBe(false);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(observer.getCurrentResult().data?.stuck).toBe(true);
    const daHoi = get.mock.calls.length;
    expect(daHoi).toBe(REMOTE_REFRESH_LIMIT_MS / 3_000 + 1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(get).toHaveBeenCalledTimes(daHoi);
  });

  it('không có lượt chạy (startedAt null) thì không hỏi', async () => {
    hoi(null);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(get).not.toHaveBeenCalled();
  });
});

describe('applyRefreshResult: kết quả POST Tải lại', () => {
  it('BE cũ trả {syncedAt, items}: ghi thẳng vào bản sao, không nạp lại, không có lượt nào để hỏi', async () => {
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const cu: RemoteSkuList = { syncedAt: '2026-11-17T08:00:00Z', items: [] };
    applyRefreshResult(queryClient, listKey, cu);
    expect(queryClient.getQueryData(listKey)).toEqual(cu);
    expect(invalidate).not.toHaveBeenCalled();
    // Trang lấy lượt chạy từ bản sao: không có `refresh` thì startedAt null, không hỏi
    const refresh = queryClient.getQueryData<RemoteSkuList>(listKey)?.refresh;
    hoi(refresh?.status === 'running' ? refresh.startedAt : null);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(get).not.toHaveBeenCalled();
  });

  it('202 lượt đang chạy: ghi lượt, chưa nạp lại danh sách', () => {
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    queryClient.setQueryData<RemoteSkuList>(listKey, { syncedAt: null, items: [], refresh: null });
    applyRefreshResult(queryClient, listKey, { refresh: luot('running') });
    expect(queryClient.getQueryData<RemoteSkuList>(listKey)?.refresh?.status).toBe('running');
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('200 lượt vừa thành công: nạp lại danh sách', () => {
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    applyRefreshResult(queryClient, listKey, { refresh: luot('succeeded') });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: listKey });
  });
});
