import type { Membership } from '@/types/auth';

/** Lý do không vào được công ty; BE chặn cùng hai ca này ở `select-company` (403 company_locked, account_locked). */
export function blockedReason(m: Membership): string | null {
  if (m.companyStatus === 'locked') return 'Công ty đang bị khoá';
  if (m.status === 'locked') return 'Tài khoản của bạn bị khoá trong công ty này';
  return null;
}

export type CompanyEntry =
  | { kind: 'none' }
  | { kind: 'auto'; companyId: string; lockedNotice: string | null }
  | { kind: 'choose' }
  | { kind: 'all_locked' };

/** Gộp các công ty không vào được thành một câu, để người dùng biết dữ liệu vẫn còn và hỏi ai. */
function lockedNotice(blocked: Membership[]): string | null {
  if (blocked.length === 0) return null;
  const lockedCompanies = blocked.filter((m) => m.companyStatus === 'locked').map((m) => m.companyName);
  const lockedAccounts = blocked.filter((m) => m.companyStatus !== 'locked').map((m) => m.companyName);
  const parts: string[] = [];
  // Tên công ty thường đã có chữ "Công ty" nên dùng nguyên tên
  if (lockedCompanies.length) parts.push(`${lockedCompanies.join(', ')} đang bị khoá, dữ liệu vẫn giữ nguyên`);
  if (lockedAccounts.length) parts.push(`tài khoản của bạn bị khoá ở ${lockedAccounts.join(', ')}`);
  const sentence = parts.join('; ');
  return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}. Liên hệ CEO công ty đó.`;
}

/** US-CT-02: chỉ còn một công ty vào được thì vào thẳng, kèm thông báo các công ty bị khoá. */
export function companyEntry(memberships: Membership[]): CompanyEntry {
  if (memberships.length === 0) return { kind: 'none' };
  const usable = memberships.filter((m) => !blockedReason(m));
  if (usable.length === 0) return { kind: 'all_locked' };
  if (usable.length > 1) return { kind: 'choose' };
  return {
    kind: 'auto',
    companyId: usable[0].companyId,
    lockedNotice: lockedNotice(memberships.filter((m) => blockedReason(m))),
  };
}
