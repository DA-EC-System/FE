/**
 * Company (Platform) types — khớp với platform.companies trong DBML.
 * Mỗi company là một tenant trong hệ thống đa công ty.
 */

export type CompanyStatus = 'active' | 'locked';

export interface Company {
  id: string;
  name: string;
  taxCode: string;
  status: CompanyStatus;
  lockReason?: string;
  lockedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CompanyCreateInput {
  name: string;
  taxCode: string;
  status: CompanyStatus;
  lockReason?: string;
}

export type CompanyUpdateInput = Partial<CompanyCreateInput>;
