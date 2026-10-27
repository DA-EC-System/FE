import { describe, expect, it } from 'vitest';
import { PERMISSIONS } from '@/utils/permissions';
import {
  hidesByZeroStock,
  listingMachine,
  presenceFrom,
  reviewsListings,
  shopMachine,
  shopUsable,
  tokenExpiringSoon,
} from './channel';

const owner = { accountId: 'a1', permissions: [PERMISSIONS.shopConnect, PERMISSIONS.shopDisconnect, PERMISSIONS.listingManage] };
const viewer = { accountId: 'a2', permissions: [PERMISSIONS.shopView] };
const DAY = 24 * 3600_000;

describe('Gian hàng (sơ đồ C1)', () => {
  it('đi đúng các mũi tên của sơ đồ', () => {
    expect(shopMachine.check('connecting', 'finish_setup', { actor: owner })).toEqual({ ok: true, to: 'active' });
    expect(shopMachine.check('needs_reauth', 'reconnect', { actor: owner })).toEqual({ ok: true, to: 'active' });
    expect(shopMachine.check('disconnected', 'reconnect', { actor: owner })).toEqual({ ok: true, to: 'active' });
    expect(shopMachine.check('needs_reauth', 'disconnect', { actor: owner })).toEqual({ ok: true, to: 'disconnected' });
  });

  it('không kết nối lại gian hàng đang hoạt động, không ngắt lại gian hàng đã ngắt', () => {
    expect(shopMachine.check('active', 'reconnect', { actor: owner })).toEqual({ ok: false, code: 'invalid_transition' });
    expect(shopMachine.check('disconnected', 'disconnect', { actor: owner })).toEqual({ ok: false, code: 'invalid_transition' });
  });

  it('mất uỷ quyền do sàn gây ra, người dùng không bấm được', () => {
    expect(shopMachine.available('active', owner).map((t) => t.action)).not.toContain('lose_auth');
  });

  it('cần quyền ngắt kết nối', () => {
    expect(shopMachine.check('active', 'disconnect', { actor: viewer })).toEqual({ ok: false, code: 'forbidden' });
  });

  it('gọi được API sàn khi đang thiết lập hoặc đang hoạt động', () => {
    expect(shopUsable('connecting')).toBe(true);
    expect(shopUsable('active')).toBe(true);
    expect(shopUsable('needs_reauth')).toBe(false);
    expect(shopUsable('disconnected')).toBe(false);
  });

  it('sắp hết hạn là nhãn phụ của gian hàng đang hoạt động, còn dưới 7 ngày', () => {
    const now = Date.parse('2026-05-01T00:00:00Z');
    const at = (days: number) => new Date(now + days * DAY).toISOString();
    expect(tokenExpiringSoon('active', at(3), now)).toBe(true);
    expect(tokenExpiringSoon('active', at(10), now)).toBe(false);
    expect(tokenExpiringSoon('needs_reauth', at(3), now)).toBe(false);
    expect(tokenExpiringSoon('active', null, now)).toBe(false);
  });
});

describe('Listing (sơ đồ C2)', () => {
  it('đẩy lại được sau lỗi, bị từ chối hoặc đã gỡ', () => {
    for (const from of ['push_failed', 'rejected', 'delisted'] as const) {
      expect(listingMachine.check(from, 'push', { actor: owner })).toEqual({ ok: true, to: 'pushing' });
    }
  });

  it('không đẩy khi đang đẩy hoặc sàn đang khoá', () => {
    expect(listingMachine.check('pushing', 'push', { actor: owner })).toEqual({ ok: false, code: 'invalid_transition' });
    expect(listingMachine.check('platform_hold', 'push', { actor: owner })).toEqual({ ok: false, code: 'invalid_transition' });
  });

  it('sàn khoá được cả listing đang ẩn, gỡ khoá thì bán lại', () => {
    expect(listingMachine.check('hidden', 'hold', { actor: owner })).toEqual({ ok: true, to: 'platform_hold' });
    expect(listingMachine.check('platform_hold', 'release', { actor: owner })).toEqual({ ok: true, to: 'live' });
  });

  it('gỡ khỏi sàn cần quyền quản lý listing, không gỡ listing đang đẩy', () => {
    expect(listingMachine.check('live', 'delist', { actor: owner })).toEqual({ ok: true, to: 'delisted' });
    expect(listingMachine.check('live', 'delist', { actor: viewer })).toEqual({ ok: false, code: 'forbidden' });
    expect(listingMachine.check('pushing', 'delist', { actor: owner })).toEqual({ ok: false, code: 'invalid_transition' });
  });

  it('người dùng chỉ thấy thao tác đẩy và gỡ, còn lại do sàn', () => {
    expect(listingMachine.available('live', owner).map((t) => t.action).sort()).toEqual(['delist', 'push']);
  });

  it('khác biệt theo sàn', () => {
    expect(reviewsListings('lazada')).toBe(true);
    expect(reviewsListings('tiktok')).toBe(true);
    expect(reviewsListings('shopee')).toBe(false);
    expect(hidesByZeroStock('shopee')).toBe(true);
    expect(hidesByZeroStock('lazada')).toBe(false);
  });

  it('hiện diện của SKU suy từ các listing, bỏ listing đã gỡ', () => {
    expect(presenceFrom([])).toBe('not_listed');
    expect(presenceFrom(['delisted'])).toBe('not_listed');
    expect(presenceFrom(['under_review', 'pushing'])).toBe('pending');
    expect(presenceFrom(['hidden', 'under_review'])).toBe('live');
    expect(presenceFrom(['live', 'rejected'])).toBe('error');
    expect(presenceFrom(['live', 'delisted'])).toBe('live');
  });
});
