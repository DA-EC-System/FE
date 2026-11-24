import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { fetchProductIdOfVariant, useGroups } from '@/api/catalog.api';
import { getProblem } from '@/api/client';
import { problemMessage } from '@/api/problemMessages';
import { useCreateVariantFromRemote } from '@/api/shops.api';
import type { RemoteSku } from '@/types/shop';
import { useAuth } from '@/hooks/useAuth';
import { ROUTES } from '@/router/routes';

/**
 * Tạo SKU kho từ SKU sàn rồi liên kết, ngay ở trang gian hàng (Documents/21 §18.9 R2, Documents/29 bước 5). Sản phẩm mới
 * bắt buộc có danh mục sản phẩm. SKU người bán trùng SKU kho có sẵn thì BE liên kết vào SKU đó.
 */
export function CreateVariantDialog({ shopId, remote, onClose }: { shopId: string; remote: RemoteSku | null; onClose: () => void }) {
  const groups = useGroups();
  const create = useCreateVariantFromRemote();
  const navigate = useNavigate();
  const companyId = useAuth().companyContext?.companyId ?? '';
  const [groupId, setGroupId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setGroupId('');
    setError(null);
    onClose();
  };

  const submit = async () => {
    if (!remote) return;
    if (!groupId) {
      setError('Chọn danh mục sản phẩm cho SKU kho mới');
      return;
    }
    setError(null);
    try {
      const res = await create.mutateAsync({ shopId, externalSkuId: remote.externalSkuId, groupId });
      // FE#463: có lối tới sản phẩm chứa SKU kho vừa tạo hoặc vừa liên kết; BE chỉ trả `variantId` nên tìm sản phẩm khi bấm
      const sku = remote.sellerSku;
      const open = {
        label: 'Mở sản phẩm',
        onClick: () => {
          void fetchProductIdOfVariant(res.variantId, sku)
            .then((productId) => {
              if (productId) navigate(ROUTES.company.catalogProduct(companyId, productId));
              else toast.error(`Không tìm thấy sản phẩm chứa SKU ${sku}. Tìm ở danh sách sản phẩm.`);
            })
            .catch((e: unknown) => toast.error(problemMessage(e)));
        },
      };
      if (res.pending) toast.info(`SKU kho ${sku} đã có và đang có đơn: đã gửi CEO duyệt liên kết.`);
      else if (res.created) toast.success(`Đã tạo SKU kho ${sku} và liên kết với SKU sàn.`, { action: open });
      else toast.success(`SKU kho ${sku} đã có sẵn: đã liên kết SKU sàn vào SKU đó.`, { action: open });
      close();
    } catch (e) {
      const problem = getProblem(e);
      if (problem?.status === 403) setError('Tạo SKU kho mới cần quyền sửa sản phẩm. Nhờ Admin hoặc CEO tạo, hoặc chọn SKU kho có sẵn.');
      else setError(problem?.errors?.groupId ?? problem?.errors?.externalSkuId ?? problemMessage(e));
    }
  };

  return (
    <Dialog open={Boolean(remote)} onOpenChange={(o) => !o && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tạo SKU kho mới</DialogTitle>
          <DialogDescription>
            Tạo SKU kho <b className="font-mono">{remote?.sellerSku}</b> từ SKU sàn "{remote?.title}": tên và giá lấy từ sàn, mã SKU kho là SKU người
            bán. Tạo xong tự liên kết với SKU sàn này.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor="create-variant-group">Danh mục sản phẩm</Label>
          <Select value={groupId} onValueChange={(v) => { setGroupId(v); setError(null); }} disabled={groups.isPending}>
            <SelectTrigger id="create-variant-group" className="w-full" aria-invalid={Boolean(error) || undefined} aria-describedby={error ? 'create-variant-error' : undefined}>
              <SelectValue placeholder={groups.isPending ? 'Đang tải danh mục sản phẩm…' : 'Chọn danh mục sản phẩm'} />
            </SelectTrigger>
            <SelectContent>
              {(groups.data ?? []).map((g) => (
                <SelectItem key={g.id} value={g.id}>
                  {g.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {groups.isError && <p className="text-sm text-destructive-text">{problemMessage(groups.error)}</p>}
          {error && (
            <p id="create-variant-error" className="text-sm text-destructive-text" role="alert">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={close}>
            Huỷ
          </Button>
          <Button type="button" onClick={() => void submit()} disabled={create.isPending}>
            {create.isPending ? 'Đang tạo…' : 'Tạo và liên kết'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
