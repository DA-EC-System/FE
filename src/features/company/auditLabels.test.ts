import { describe, expect, it } from 'vitest';
import { auditOperationLabel, auditOperationVariant, auditValueText } from './auditLabels';

describe('Nhãn thao tác nhật ký (FE#298, BE#352)', () => {
  it('nhân viên, link mời theo operation', () => {
    const r = { action: 'update' as const, entityType: 'core.memberships' };
    expect(auditOperationLabel({ ...r, operation: 'lock' })).toBe('Tạm khoá');
    expect(auditOperationVariant({ ...r, operation: 'lock' })).toBe('destructive');
    expect(auditOperationLabel({ ...r, operation: 'unlock' })).toBe('Mở khoá');
    expect(auditOperationLabel({ ...r, operation: 'change_roles' })).toBe('Đổi vai trò');
    expect(auditOperationLabel({ action: 'create', entityType: 'core.memberships', operation: 'join' })).toBe('Duyệt vào công ty');
    expect(auditOperationLabel({ ...r, entityType: 'core.invitations', operation: 'revoke' })).toBe('Huỷ link');
  });

  it('cùng mã khác nghĩa theo đối tượng; phiếu kiểm hàng về trả về nháp là Yêu cầu kiểm lại', () => {
    const r = { action: 'update' as const, operation: 'reject' };
    expect(auditOperationLabel({ ...r, entityType: 'product.purchase_requests' })).toBe('Từ chối');
    expect(auditOperationLabel({ ...r, entityType: 'product.stock_documents', after: { status: 'draft' } })).toBe('Yêu cầu kiểm lại');
    expect(auditOperationLabel({ ...r, entityType: 'product.stock_documents', after: { status: 'rejected' } })).toBe('Từ chối');
    expect(auditOperationLabel({ action: 'update', entityType: 'channel.listings', operation: 'take_over_content' })).toBe(
      'Ghi nội dung Commerio lên sàn',
    );
  });

  it('không có operation thì Thêm/Sửa/Xoá; mã lạ hiện nguyên mã', () => {
    expect(auditOperationLabel({ action: 'update', entityType: 'core.roles', operation: null })).toBe('Sửa');
    expect(auditOperationLabel({ action: 'update', entityType: 'x.y', operation: 'zzz' })).toBe('zzz');
  });

  it('trạng thái nhân viên theo chữ trang Nhân viên', () => {
    expect(auditValueText('active')).toBe('Đang hoạt động');
    expect(auditValueText('locked')).toBe('Tạm khoá');
  });
});
