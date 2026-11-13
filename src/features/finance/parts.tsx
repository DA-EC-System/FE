import { useAuth } from '@/hooks/useAuth';

export function useCompanyId() {
  return useAuth().companyContext?.companyId ?? '';
}
