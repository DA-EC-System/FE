import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { AlertMessage } from '@/components/common/AlertMessage';
import { Money } from '@/components/common/Money';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { usePushPreview } from '@/api/readiness.api';
import { problemMessage } from '@/api/problemMessages';
import type { PushPreviewRow } from '@/types/blocker';
import { blockerFix, canUseFix } from '../blockerFix';
import { stockToPushText } from './publishRows';

export interface PushPreviewTarget {
  variantId: string;
  /** Chưa có SKU sàn: lần đăng tạo sản phẩm mới trên sàn */
  isNew: boolean;
}

export interface PushPreviewDialogProps {
  /** SKU định đăng; null là đóng */
  targets: PushPreviewTarget[] | null;
  shopId: string;
  companyId: string;
  platform: string | null;
  shopLabel: string;
  can: { product: boolean; finance: boolean };
  saving: boolean;
  /** Chỉ gồm SKU đăng được theo kết quả kiểm */
  onConfirm: (variantIds: string[]) => void;
  onClose: () => void;
}

/**
 * Xem trước khi "Đăng bán N SKU" ở Listing & giá (FE#461): gọi push-preview (§18.11, commerio-backend#566), bảng SKU đăng được
 * (giá, thực nhận, tồn sẽ đẩy) và bị chặn (lý do + chỗ sửa). Nút xác nhận chỉ gồm SKU đăng được; chưa kiểm được thì không đăng
 */
export function PushPreviewDialog({ targets, shopId, companyId, platform, shopLabel, can, saving, onConfirm, onClose }: PushPreviewDialogProps) {
  const variantIds = useMemo(() => (targets ?? []).map((t) => t.variantId), [targets]);
  const preview = usePushPreview(targets ? shopId : null, variantIds);
  const rows = useMemo(() => preview?.data ?? [], [preview?.data]);
  const ready = rows.filter((r) => r.status === 'ready');
  const blocked = rows.filter((r) => r.status !== 'ready');
  const newIds = useMemo(() => new Set((targets ?? []).filter((t) => t.isNew).map((t) => t.variantId)), [targets]);
  const newReady = ready.filter((r) => newIds.has(r.variantId)).length;
  // Kết quả cũ của lần kiểm khác (keepPreviousData) không dùng để đăng
  const checking = Boolean(targets) && (!preview || preview.isLoading || preview.isPlaceholderData);

  return (
    <Dialog open={Boolean(targets)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Xem trước khi đăng lên {shopLabel}</DialogTitle>
          <DialogDescription>
            {checking
              ? `Đang kiểm ${variantIds.length} SKU…`
              : preview?.isError
                ? 'Chưa kiểm được trước khi đăng.'
                : `${ready.length} SKU đăng được, ${blocked.length} SKU bị chặn.`}
            {!checking && newReady > 0 && ` ${newReady} SKU chưa có trên sàn sẽ được tạo thành sản phẩm mới và tự liên kết.`}
          </DialogDescription>
        </DialogHeader>

        {preview?.isError ? (
          <AlertMessage severity="error">
            {problemMessage(preview.error)}{' '}
            <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={() => void preview.refetch()}>
              Kiểm lại
            </Button>
          </AlertMessage>
        ) : (
          <div className="max-h-[60vh] overflow-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-48">SKU</TableHead>
                  <TableHead className="text-right">Giá niêm yết</TableHead>
                  <TableHead className="text-right">Thực nhận</TableHead>
                  <TableHead className="text-right">Tồn sẽ đẩy</TableHead>
                  <TableHead className="min-w-56">Kết quả kiểm</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {checking ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      <Loader2 className="me-1 inline size-4 animate-spin motion-reduce:animate-none" aria-hidden /> Đang kiểm…
                    </TableCell>
                  </TableRow>
                ) : (
                  [...ready, ...blocked].map((r) => (
                    <TableRow key={r.variantId} data-testid="push-preview-row">
                      <TableCell className="align-top">
                        <p className="font-mono text-sm">{r.sku}</p>
                        <p className="text-xs text-muted-foreground">{[r.productName, r.attributesLabel].filter(Boolean).join(' · ')}</p>
                      </TableCell>
                      <TableCell className="text-right align-top">{r.listPrice !== null ? <Money value={r.listPrice} /> : '—'}</TableCell>
                      <TableCell className="text-right align-top">{r.netReceived !== null ? <Money value={r.netReceived} /> : '—'}</TableCell>
                      <TableCell className="text-right align-top tabular-nums">{stockToPushText(r)}</TableCell>
                      <TableCell className="align-top">
                        {r.status === 'ready' ? (
                          <span className="text-sm text-success-text">{newIds.has(r.variantId) ? 'Sẽ đăng sản phẩm mới' : 'Sẽ đăng'}</span>
                        ) : (
                          <Blockers row={r} companyId={companyId} platform={platform} shopId={shopId} can={can} />
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Huỷ
          </Button>
          <Button type="button" disabled={checking || saving || !ready.length || Boolean(preview?.isError)} onClick={() => onConfirm(ready.map((r) => r.variantId))}>
            {saving ? 'Đang đăng…' : checking ? 'Đang kiểm trước khi đăng…' : `Đăng ${ready.length} SKU`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Blockers({
  row,
  companyId,
  platform,
  shopId,
  can,
}: {
  row: PushPreviewRow;
  companyId: string;
  platform: string | null;
  shopId: string;
  can: { product: boolean; finance: boolean };
}) {
  if (!row.blockers.length) return <span className="text-sm text-destructive-text">Chưa đăng được</span>;
  return (
    <ul className="grid gap-0.5 text-sm" data-testid="push-preview-blockers">
      {row.blockers.map((b, i) => {
        const found = blockerFix(b.target, {
          companyId,
          productId: row.productId,
          platform,
          shopId,
          variantId: b.variantIds.includes(row.variantId) ? row.variantId : (b.variantIds[0] ?? row.variantId),
        });
        const fix = found && canUseFix(found, can) ? found : null;
        return (
          <li key={`${b.code}-${i}`} className="text-destructive-text">
            Chưa đăng: {b.label}
            {fix && (
              <>
                {' '}
                <Link to={fix.to} className="font-medium text-primary-text underline" data-testid="push-preview-fix">
                  {fix.label}
                </Link>
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}
