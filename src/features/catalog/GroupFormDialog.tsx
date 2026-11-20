import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertMessage } from '@/components/common/AlertMessage';
import { FormTextField } from '@/components/common/FormTextField';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Form } from '@/components/ui/form';
import { useCreateGroup, useUpdateGroup } from '@/api/catalog.api';
import { getProblem } from '@/api/client';
import { problemMessage } from '@/api/problemMessages';
import { conflictCurrent } from '@/features/identity/shared';
import type { ProductGroup } from '@/types/catalog';
import { groupSchema, type GroupForm } from './shared';

interface GroupFormDialogProps {
  open: boolean;
  /** null: tạo mới */
  group: ProductGroup | null;
  onClose: () => void;
  onDone: (message: string) => void;
}

/** Thêm, sửa nhóm hàng (Documents/21 §5.2, FE#350). Mã SKU sinh theo mẫu của công ty, không theo nhóm */
export function GroupFormDialog({ open, group, onClose, onDone }: GroupFormDialogProps) {
  const createMut = useCreateGroup();
  const updateMut = useUpdateGroup();
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const form = useForm<GroupForm>({ resolver: zodResolver(groupSchema), defaultValues: { name: '' } });
  const { control, reset, setError: setFieldError } = form;

  useEffect(() => {
    if (open) {
      reset({ name: group?.name ?? '' });
      setVersion(group?.version ?? 0);
      setError(null);
    }
  }, [open, group, reset]);

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      if (group) {
        await updateMut.mutateAsync({ id: group.id, version, ...values });
        onDone(`Đã cập nhật nhóm hàng ${values.name}`);
      } else {
        await createMut.mutateAsync(values);
        onDone(`Đã tạo nhóm hàng ${values.name}`);
      }
    } catch (e) {
      const problem = getProblem(e);
      const latest = conflictCurrent<ProductGroup>(e);
      if (problem?.code === 'version_conflict' && latest) {
        reset({ name: latest.name });
        setVersion(latest.version);
        setError('Nhóm hàng vừa được người khác sửa. Form đã hiện bản mới nhất, chưa có gì thay đổi.');
        return;
      }
      const fields = problem?.errors ?? {};
      if (problem?.code === 'name_taken') {
        setFieldError('name', { message: fields.name ?? 'Đã có nhóm hàng cùng tên' });
        return;
      }
      if (fields.name) setFieldError('name', { message: fields.name });
      else setError(problemMessage(e));
    }
  });

  const busy = createMut.isPending || updateMut.isPending;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{group ? 'Sửa nhóm hàng' : 'Thêm nhóm hàng'}</DialogTitle>
          <DialogDescription>Nhóm hàng dùng để lọc sản phẩm trong app, không ghép sang sàn.</DialogDescription>
        </DialogHeader>

        {error && <AlertMessage severity="warning">{error}</AlertMessage>}

        <Form {...form}>
          <form onSubmit={onSubmit} noValidate className="grid gap-4">
            <FormTextField control={control} name="name" label="Tên nhóm hàng" autoFocus />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
                Huỷ
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? 'Đang lưu...' : 'Lưu'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
