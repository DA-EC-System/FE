import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { UseQueryResult } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { AlertMessage } from '@/components/common/AlertMessage';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { getProblem } from '@/api/client';
import { problemMessage } from '@/api/problemMessages';
import { ROUTES } from '@/router/routes';
import { useCompanyId } from './parts';

interface DocDetailProps<T> {
  query: UseQueryResult<T>;
  tab: 'invoices' | 'receipts' | 'vouchers';
  /** "hoá đơn", "phiếu thu", "phiếu chi" */
  noun: string;
  children: (doc: T) => ReactNode;
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Khung chung của trang chi tiết chứng từ: nút quay lại tab, 404, đang tải (AC-D2) */
export function DocDetail<T>({ query, tab, noun, children }: DocDetailProps<T>) {
  const navigate = useNavigate();
  const companyId = useCompanyId();
  const back = (
    <Button variant="ghost" size="sm" className="mb-2 -ms-2" onClick={() => navigate(ROUTES.company.financeDocuments(companyId, tab))}>
      <ArrowLeft />
      {capitalize(noun)}
    </Button>
  );

  if (query.isError) {
    const notFound = getProblem(query.error)?.status === 404;
    return (
      <div>
        {back}
        <PageHeader title={notFound ? 'Không tìm thấy' : `Không tải được ${noun}`} />
        <AlertMessage severity="error">
          {notFound
            ? `Không tìm thấy ${noun}. ${capitalize(noun)} không tồn tại hoặc không thuộc công ty này.`
            : problemMessage(query.error)}
        </AlertMessage>
      </div>
    );
  }
  if (!query.data) {
    return (
      <div className="grid gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-60 w-full" />
      </div>
    );
  }
  return (
    <div>
      {back}
      {children(query.data)}
    </div>
  );
}
