import { describe, expect, it } from 'vitest';
import { PERMISSIONS } from '@/utils/permissions';
import {
  listingMachine,
  presenceFrom,
  shopMachine,
  shopUsable,
  syncRunActive,
} from './channel';

const owner = { accountId: 'a1', permissions: [PERMISSIONS.shopConnect, PERMISSIONS.shopDisconnect, PERMISSIONS.listingManage] };
const viewer = { accountId: 'a2', permissions: [PERMISSIONS.shopView] };

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

  it('chưa thiết lập xong thì ngắt hoặc mất uỷ quyền quay về đang kết nối (25 §6.1)', () => {
    expect(shopMachine.check('disconnected', 'resume_setup', { actor: owner })).toEqual({ ok: true, to: 'connecting' });
    expect(shopMachine.check('needs_reauth', 'resume_setup', { actor: owner })).toEqual({ ok: true, to: 'connecting' });
    expect(shopMachine.check('active', 'resume_setup', { actor: owner })).toEqual({ ok: false, code: 'invalid_transition' });
    expect(shopMachine.check('disconnected', 'resume_setup', { actor: viewer })).toEqual({ ok: false, code: 'forbidden' });
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


});

describe('Listing (sơ đồ C2)', () => {
  it('đẩy lần đầu, đẩy lại sau lỗi, bị từ chối hoặc sàn khoá (25 §6.4)', () => {
    for (const from of ['not_listed', 'push_failed', 'rejected', 'platform_hold'] as const) {
      expect(listingMachine.check(from, 'push', { actor: owner })).toEqual({ ok: true, to: 'pushing' });
    }
  });

  it('không đẩy khi đang đẩy, đang bán hoặc chờ duyệt', () => {
    for (const from of ['pushing', 'live', 'under_review'] as const) {
      expect(listingMachine.check(from, 'push', { actor: owner })).toEqual({ ok: false, code: 'invalid_transition' });
    }
  });

  it('đã gỡ là trạng thái kết thúc, không có mũi đi ra', () => {
    expect(listingMachine.isFinal('delisted')).toBe(true);
    expect(listingMachine.check('delisted', 'push', { actor: owner })).toEqual({ ok: false, code: 'invalid_transition' });
  });

  it('sửa nội dung mà sàn đòi duyệt lại: đang bán sang chờ duyệt, do sàn', () => {
    expect(listingMachine.check('live', 'request_review')).toEqual({ ok: true, to: 'under_review' });
    expect(listingMachine.available('live', owner).map((t) => t.action)).not.toContain('request_review');
  });

  it('sàn đổi ngoài app: hệ thống ẩn, CEO quyết bằng quyền listing.manage (commerio-backend#360)', () => {
    expect(listingMachine.check('live', 'outside_hold')).toEqual({ ok: true, to: 'hidden' });
    expect(listingMachine.available('live', owner).map((t) => t.action)).not.toContain('outside_hold');
    expect(listingMachine.check('hidden', 'outside_resolve', { actor: owner })).toEqual({ ok: true, to: 'live' });
    expect(listingMachine.check('hidden', 'outside_resolve', { actor: viewer }).ok).toBe(false);
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

  it('chưa lên sàn thì không có gì để gỡ (25 §6.4)', () => {
    expect(listingMachine.check('not_listed', 'delist', { actor: owner })).toEqual({ ok: false, code: 'invalid_transition' });
    expect(listingMachine.available('not_listed', owner).map((t) => t.action)).toEqual(['push']);
  });

  it('người dùng chỉ thấy thao tác đẩy, gỡ, sửa nội dung, còn lại do sàn', () => {
    expect(listingMachine.available('live', owner).map((t) => t.action).sort()).toEqual(['delist', 'update_content']);
    expect(listingMachine.available('rejected', owner).map((t) => t.action).sort()).toEqual(['delist', 'push']);
  });



  it('sửa nội dung: chỉ listing đang bán, giữ live, cần quyền quản lý listing (§18.3)', () => {
    expect(listingMachine.check('live', 'update_content', { actor: owner })).toEqual({ ok: true, to: 'live' });
    expect(listingMachine.check('live', 'update_content', { actor: viewer })).toEqual({ ok: false, code: 'forbidden' });
    for (const status of ['hidden', 'under_review', 'platform_hold', 'rejected', 'push_failed', 'delisted'] as const) {
      expect(listingMachine.check(status, 'update_content', { actor: owner })).toEqual({ ok: false, code: 'invalid_transition' });
    }
    // Sàn ngừng bán bản cũ để duyệt (PENDING): hệ thống chuyển tiếp, người dùng không bấm
    expect(listingMachine.check('live', 'request_review', { actor: owner })).toEqual({ ok: true, to: 'under_review' });
  });

  it('hiện diện của SKU suy từ các listing, bỏ listing đã gỡ', () => {
    expect(presenceFrom([])).toBe('not_listed');
    expect(presenceFrom(['delisted'])).toBe('not_listed');
    expect(presenceFrom(['under_review', 'pushing'])).toBe('pending');
    // hidden không tính là live (Documents/21 §17.1)
    expect(presenceFrom(['hidden', 'under_review'])).toBe('pending');
    expect(presenceFrom(['hidden'])).toBe('not_listed');
    expect(presenceFrom(['live', 'rejected'])).toBe('live');
    expect(presenceFrom(['push_failed', 'pushing'])).toBe('error');
    expect(presenceFrom(['live', 'delisted'])).toBe('live');
  });
});

describe('Lượt đồng bộ (Documents/21 §18.5 SyncRun)', () => {
  it('queued, running là còn chạy; done, failed, chưa có lượt thì không', () => {
    expect(syncRunActive({ status: 'queued' })).toBe(true);
    expect(syncRunActive({ status: 'running' })).toBe(true);
    expect(syncRunActive({ status: 'done' })).toBe(false);
    expect(syncRunActive({ status: 'failed' })).toBe(false);
    expect(syncRunActive(null)).toBe(false);
  });
});
