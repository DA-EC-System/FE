import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { BookCheck, Pencil, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { AlertMessage } from '@/components/common/AlertMessage';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useDeleteVoucher, usePostVoucher, useUpdateVoucher, useVoucher } from '@/api/finance.api';
import { getProblem } from '@/api/client';
import { problemMessage } from '@/api/problemMessages';
import { ROUTES } from '@/router/routes';
import { formatCurrency, formatDate, formatDateTime } from '@/utils/format';
import type { PaymentVoucher } from '@/types/finance';
import { Info } from '@/features/sales/Info';
import { DOC_STATUS, VOUCHER_PURPOSE_LABELS } from './shared';
import { PayoutDialog, StatusBadge, payoutFieldErrors, useCanWrite, useCompanyId } from './parts';
import { DocDetail } from './DocDetail';
import { VoucherSource } from './FinanceDocumentsPage';

const STALE = 'Phiếu chi vừa được người khác cập nhật. Đã tải lại phiếu mới nhất.';

/** UC-PF-05 — Chi tiết phiếu chi; phiếu nháp sửa, xoá, ghi sổ được (AC-V2, AC-V3) */
export function PaymentVoucherDetailPage() {
  const { id = '' } = useParams();
  const query = useVoucher(id);
  return (
    <DocDetail query={query} tab="vouchers" noun="phiếu chi">
      {(v) => <VoucherView voucher={v} />}
    </DocDetail>
  );
}

function VoucherView({ voucher: v }: { voucher: PaymentVoucher }) {
  const navigate = useNavigate();
  const companyId = useCompanyId();
  const canWrite = useCanWrite();
  const update = useUpdateVoucher();
  const remove = useDeleteVoucher();
  const post = usePostVoucher();
  const [dialog, setDialog] = useState<'edit' | 'delete' | 'post' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const editable = canWrite && v.status === 'draft';

  /** 409: báo theo mã, danh sách và phiếu đã được làm mới sau mutation (AC-C3) */
  const conflictMessage = (e: unknown) => {
    const problem = getProblem(e);
    if (problem?.code === 'not_draft' || problem?.code === 'version_conflict') return STALE;
    if (problem?.code === 'already_processed' && problem.detail) return problem.detail;
    return null;
  };

  const save = async (values: { paidOn: string; note: string }) => {
    try {
      const saved = await update.mutateAsync({ id: v.id, amount: v.amount, ...values, version: v.version });
      toast.success(`Đã lưu phiếu chi ${saved.number}`);
      setDialog(null);
    } catch (e) {
      const conflict = conflictMessage(e);
      if (conflict) {
        setDialog(null);
        setError(conflict);
        return;
      }
      return payoutFieldErrors(e) ?? problemMessage(e);
    }
  };

  const destroy = async () => {
    setError(null);
    try {
      await remove.mutateAsync({ id: v.id, version: v.version });
      toast.success(`Đã xoá phiếu chi ${v.number}`);
      navigate(ROUTES.company.financeDocuments(companyId, 'vouchers'));
    } catch (e) {
      setError(conflictMessage(e) ?? problemMessage(e));
    } finally {
      setDialog(null);
    }
  };

  const postVoucher = async () => {
    setError(null);
    try {
      const posted = await post.mutateAsync({ id: v.id, version: v.version });
      toast.success(`Đã ghi sổ phiếu chi ${posted.number}`);
    } catch (e) {
      setError(conflictMessage(e) ?? problemMessage(e));
    } finally {
      setDialog(null);
    }
  };

  return (
    <>
      <PageHeader
        title={`Phiếu chi ${v.number}`}
        action={
          editable ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setDialog('edit')}>
                <Pencil />
                Sửa
              </Button>
              <Button variant="outline" onClick={() => setDialog('delete')}>
                <Trash2 />
                Xoá
              </Button>
              <Button onClick={() => setDialog('post')}>
                <BookCheck />
                Ghi sổ
              </Button>
            </div>
          ) : undefined
        }
      />
      {error && (
        <AlertMessage severity="error" className="mb-4" onClose={() => setError(null)}>
          {error}
        </AlertMessage>
      )}
      <Card>
        <CardContent className="grid gap-4 sm:grid-cols-4">
          <Info label="Mục đích">{VOUCHER_PURPOSE_LABELS[v.purpose]}</Info>
          <Info label="Chứng từ gốc">
            <VoucherSource voucher={v} />
          </Info>
          <Info label="Số tiền">{formatCurrency(v.amount)}</Info>
          <Info label="Trạng thái">
            <span data-testid="doc-status">
              <StatusBadge status={DOC_STATUS[v.status]} />
            </span>
          </Info>
          <Info label="Ngày chi">{formatDate(v.paidOn)}</Info>
          <Info label="Người lập">
            {v.createdBy?.name ?? '—'}
            <span className="block text-xs text-muted-foreground">{formatDateTime(v.createdAt)}</span>
          </Info>
          <Info label="Người ghi sổ">
            <span data-testid="voucher-posted">
              {v.postedBy?.name ?? '—'}
              {v.postedAt && <span className="block text-xs text-muted-foreground">{formatDateTime(v.postedAt)}</span>}
            </span>
          </Info>
          <Info label="Ghi chú">{v.note || '—'}</Info>
        </CardContent>
      </Card>

      <PayoutDialog
        open={dialog === 'edit'}
        title={`Sửa phiếu chi ${v.number}`}
        submitLabel="Lưu"
        initial={{ paidOn: v.paidOn, note: v.note }}
        loading={update.isPending}
        summary={
          <div className="grid grid-cols-2 gap-4 rounded-md border p-3">
            <Info label="Mục đích">{VOUCHER_PURPOSE_LABELS[v.purpose]}</Info>
            <Info label="Chứng từ gốc">
              <VoucherSource voucher={v} />
            </Info>
            <Info label="Số tiền">{formatCurrency(v.amount)}</Info>
          </div>
        }
        onSubmit={save}
        onClose={() => setDialog(null)}
      />
      <ConfirmDialog
        open={dialog === 'delete'}
        title="Xoá phiếu chi"
        message={`Xoá phiếu chi nháp ${v.number}?`}
        confirmLabel="Xoá"
        destructive
        loading={remove.isPending}
        onConfirm={destroy}
        onClose={() => setDialog(null)}
      />
      <ConfirmDialog
        open={dialog === 'post'}
        title="Ghi sổ phiếu chi"
        message={`Ghi sổ phiếu chi ${v.number} số tiền ${formatCurrency(v.amount)}? Sau khi ghi sổ không sửa, xoá được.`}
        confirmLabel="Ghi sổ"
        loading={post.isPending}
        onConfirm={postVoucher}
        onClose={() => setDialog(null)}
      />
    </>
  );
}
