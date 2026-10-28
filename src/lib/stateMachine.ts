/**
 * Bảng chuyển trạng thái dùng chung cho các thực thể vòng đời (Documents/so-do-vong-doi).
 * Một bảng khai báo dùng ở cả mock (từ chối chuyển sai, trả 409) và UI (chỉ hiện nút hợp lệ),
 * để hai bên không lệch nhau. BE làm theo cùng bảng.
 */

export interface TransitionActor {
  accountId: string;
  permissions: readonly string[];
  /** CEO, hoặc khách thuê chỉ có một thành viên: được tự làm bước có `allowSelfApproval` (BE `canSelfApprove`) */
  canSelfApprove?: boolean;
}

/** Bản ghi có người lập: dùng cho quy tắc người thứ hai */
export interface OwnedRecord {
  createdBy?: string | null;
}

export interface Transition<S extends string, A extends string, R = OwnedRecord> {
  from: S | readonly S[];
  to: S;
  action: A;
  /** Nhãn nút trên UI */
  label: string;
  /** Cần có quyền này (bỏ trống: ai xem được bản ghi cũng làm được) */
  permission?: string;
  /** Người làm phải khác người lập phiếu */
  needsSecondPerson?: boolean;
  /** Bước người thứ hai cho người `canSelfApprove` tự làm; BE ghi `self_approved` (chỉ bảng có cột này) */
  allowSelfApproval?: boolean;
  /** Bắt buộc ghi lý do */
  needsReason?: boolean;
  /** Chỉ hệ thống hoặc sàn làm (không hiện nút) */
  system?: boolean;
  /** Điều kiện thêm theo dữ liệu: trả mã lỗi khi bị chặn, null khi cho qua */
  guard?: (record: R) => string | null;
}

export type TransitionCheck<S extends string> =
  | { ok: true; to: S; selfApproved?: true }
  | {
      ok: false;
      /** Mã lỗi Problem Details, câu tiếng Việt ở api/problemMessages.ts */
      code: 'invalid_transition' | 'forbidden' | 'second_person_required' | 'reason_required' | string;
    };

export interface StateMachine<S extends string, A extends string, R = OwnedRecord> {
  transitions: readonly Transition<S, A, R>[];
  /** Kiểm một thao tác: dùng ở mock trước khi đổi trạng thái */
  check(
    from: S,
    action: A,
    options?: { actor?: TransitionActor; record?: R; reason?: string | null },
  ): TransitionCheck<S>;
  /** Các thao tác người dùng làm được từ trạng thái hiện tại (bỏ thao tác của hệ thống) */
  available(from: S, actor: TransitionActor, record?: R): Transition<S, A, R>[];
  /**
   * Nút cho trạng thái hiện tại theo Test_UI: thiếu quyền thì không có trong danh sách,
   * bị luật chặn (người thứ hai, guard) thì có kèm `blocked` là mã lỗi để hiện nút mờ và lý do.
   */
  options(from: S, actor: TransitionActor, record?: R): TransitionOption<S, A, R>[];
  /** Trạng thái kết thúc: không còn chuyển nào đi ra */
  isFinal(state: S): boolean;
}

export interface TransitionOption<S extends string, A extends string, R = OwnedRecord> {
  transition: Transition<S, A, R>;
  /** Mã lỗi khi bị chặn (câu tiếng Việt ở api/problemMessages.ts), null khi làm được */
  blocked: string | null;
}

const fromList = <S extends string>(from: S | readonly S[]): readonly S[] =>
  typeof from === 'string' ? [from] : from;

export function defineMachine<S extends string, A extends string, R extends OwnedRecord = OwnedRecord>(
  transitions: readonly Transition<S, A, R>[],
): StateMachine<S, A, R> {
  const find = (from: S, action: A) =>
    transitions.find((t) => t.action === action && fromList(t.from).includes(from));

  const isOwner = (t: Transition<S, A, R>, actor?: TransitionActor, record?: R) =>
    Boolean(actor && t.needsSecondPerson && record?.createdBy && record.createdBy === actor.accountId);

  function blocked(t: Transition<S, A, R>, actor?: TransitionActor, record?: R): string | null {
    if (actor && t.permission && !actor.permissions.includes(t.permission)) return 'forbidden';
    if (isOwner(t, actor, record) && !(t.allowSelfApproval && actor?.canSelfApprove)) {
      return 'second_person_required';
    }
    return (record && t.guard?.(record)) || null;
  }

  return {
    transitions,
    check(from, action, { actor, record, reason } = {}) {
      const t = find(from, action);
      if (!t) return { ok: false, code: 'invalid_transition' };
      const code = blocked(t, actor, record);
      if (code) return { ok: false, code };
      if (t.needsReason && !reason?.trim()) return { ok: false, code: 'reason_required' };
      return isOwner(t, actor, record) ? { ok: true, to: t.to, selfApproved: true } : { ok: true, to: t.to };
    },
    available(from, actor, record) {
      return transitions.filter(
        (t) => !t.system && fromList(t.from).includes(from) && !blocked(t, actor, record),
      );
    },
    options(from, actor, record) {
      return transitions
        .filter(
          (t) =>
            !t.system &&
            fromList(t.from).includes(from) &&
            (!t.permission || actor.permissions.includes(t.permission)),
        )
        .map((t) => ({ transition: t, blocked: blocked(t, actor, record) }));
    },
    isFinal(state) {
      return !transitions.some((t) => fromList(t.from).includes(state));
    },
  };
}

/** Một dòng lịch sử trạng thái, hiển thị bằng components/common/StatusTimeline */
export interface StatusChange<S extends string = string> {
  at: string;
  from: S | null;
  to: S;
  /** Người làm; null khi do sàn hoặc hệ thống */
  by: { id: string; name: string } | null;
  source: 'user' | 'marketplace' | 'system';
  reason?: string | null;
}
