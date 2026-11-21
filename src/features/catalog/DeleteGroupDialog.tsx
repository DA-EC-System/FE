import { useEffect, useState } from 'react';
import { AlertMessage } from '@/components/common/AlertMessage';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useDeleteGroup, useMoveGroupProducts } from '@/api/catalog.api';
import { getProblem } from '@/api/client';
import { problemMessage } from '@/api/problemMessages';
import type { ProductGroup } from '@/types/catalog';

interface DeleteGroupDialogProps {
  /** Nhóm còn sản phẩm (kể cả đã lưu trữ) muốn xoá; null là đóng */
  group: ProductGroup | null;
  groups: ProductGroup[];
  onClose: () => void;
  onDone: (message: string) => void;
}

/**
 * Xoá nhóm còn sản phẩm (FE#350, Documents/21 §5.2): chuyển hết sản phẩm sang nhóm khác (`move-products` không gửi
 * `productIds`) rồi xoá. Chuyển xong mà xoá vấp 409 thì nhóm vẫn còn, sản phẩm đã sang nhóm mới: báo rõ để thử lại.
 * Chuyển từng sản phẩm làm ở form sản phẩm (ô Nhóm hàng).
 */
export function DeleteGroupDialog({ group, groups, onClose, onDone }: DeleteGroupDialogProps) {
  const move = useMoveGroupProducts();
  const remove = useDeleteGroup();
  const [targetId, setTargetId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const targets = groups.filter((g) => g.id !== group?.id);

  useEffect(() => {
    if (group) {
      setTargetId('');
      setError(null);
    }
  }, [group]);

  const busy = move.isPending || remove.isPending;
  const target = targets.find((g) => g.id === targetId);

  const submit = async () => {
    if (!group) return;
    if (!target) {
      setError('Chọn nhóm nhận sản phẩm');
      return;
    }
    setError(null);
    let moved: number;
    try {
      ({ moved } = await move.mutateAsync({ id: group.id, targetGroupId: target.id }));
    } catch (e) {
      setError(getProblem(e)?.errors?.targetGroupId ?? problemMessage(e));
      return;
    }
    const prefix = `Đã chuyển ${moved} sản phẩm sang ${target.name}`;
    try {
      await remove.mutateAsync({ id: group.id, version: group.version });
      onDone(`${prefix} và xoá nhóm ${group.name}`);
    } catch (e) {
      const code = getProblem(e)?.code;
      // Sản phẩm đã chuyển; nhóm còn lại vì có người vừa thêm sản phẩm hoặc sửa nhóm
      setError(
        code === 'in_use'
          ? `${prefix}, nhưng vừa có sản phẩm mới vào nhóm ${group.name} nên chưa xoá được. Bấm lại để chuyển nốt.`
          : code === 'version_conflict'
            ? `${prefix}, nhưng nhóm ${group.name} vừa được người khác sửa nên chưa xoá. Đóng rồi xoá lại.`
            : `${prefix}, nhưng chưa xoá được nhóm: ${problemMessage(e)}`,
      );
    }
  };

  return (
    <Dialog open={Boolean(group)} onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Xoá nhóm {group?.name}</DialogTitle>
          <DialogDescription>
            Nhóm còn {group?.productCount} sản phẩm (kể cả đã lưu trữ). Chuyển hết sang nhóm khác rồi mới xoá được.
          </DialogDescription>
        </DialogHeader>

        {error && <AlertMessage severity="warning">{error}</AlertMessage>}

        <div className="grid gap-1.5">
          <Label htmlFor="move-target">Chuyển sản phẩm sang</Label>
          <Select value={targetId} onValueChange={setTargetId} disabled={busy}>
            <SelectTrigger id="move-target" className="w-full" aria-label="Chuyển sản phẩm sang">
              <SelectValue placeholder="Chọn danh mục sản phẩm" />
            </SelectTrigger>
            <SelectContent>
              {targets.map((g) => (
                <SelectItem key={g.id} value={g.id}>
                  {g.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!targets.length && (
            <p className="text-sm text-muted-foreground">Chưa có danh mục nào khác. Thêm danh mục mới trước.</p>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            Huỷ
          </Button>
          <Button type="button" variant="destructive" onClick={submit} disabled={busy || !targets.length}>
            {busy ? 'Đang chuyển...' : 'Chuyển tất cả và xoá'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
