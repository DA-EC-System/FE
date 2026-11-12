import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertMessage } from '@/components/common/AlertMessage';
import { BlockedReason } from '@/components/common/BlockedReason';
import { FormTextField } from '@/components/common/FormTextField';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Form, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Skeleton } from '@/components/ui/skeleton';
import { useCreateRole, usePermissionCatalog, useUpdateRole } from '@/api/identity.api';
import { getErrorMessage, getProblem } from '@/api/client';
import { problemMessage } from '@/api/problemMessages';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { MODULE_LABELS } from '@/utils/modules';
import type { PermissionDef, Role } from '@/types/identity';
import { conflictCurrent, isAssignablePermission, roleSchema, type RoleForm } from './shared';

const NOT_HELD = 'Bạn không có quyền này nên không gán được cho vai trò';

interface RoleFormDialogProps {
  open: boolean;
  /** null: tạo mới */
  role: Role | null;
  /** Vai trò có sẵn hoặc có quyền mình không có: chỉ xem tập quyền */
  readOnly: boolean;
  readOnlyReason?: string | null;
  onClose: () => void;
  onDone: (message: string) => void;
}

/** UC-PI-06: tạo, sửa hoặc xem tập quyền của một vai trò */
export function RoleFormDialog({
  open,
  role,
  readOnly,
  readOnlyReason,
  onClose,
  onDone,
}: RoleFormDialogProps) {
  const { companyContext } = useAuth();
  const catalog = usePermissionCatalog();
  const createMut = useCreateRole();
  const updateMut = useUpdateRole();
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(role?.version ?? 0);

  const form = useForm<RoleForm>({
    resolver: zodResolver(roleSchema),
    defaultValues: { name: '', permissions: [] },
  });
  const { control, reset, setError: setFieldError } = form;

  useEffect(() => {
    if (open) {
      reset({ name: role?.name ?? '', permissions: role?.permissions ?? [] });
      setVersion(role?.version ?? 0);
      setError(null);
    }
  }, [open, role, reset]);

  const held = useMemo(() => new Set(companyContext?.permissions ?? []), [companyContext]);

  // Nhóm theo phân hệ. Khi xem chỉ hiện quyền vai trò đang có; khi tạo, sửa bỏ quyền nền tảng (M3)
  const groups = useMemo(() => {
    const defs = catalog.data ?? [];
    const shown = readOnly
      ? defs.filter((d) => role?.permissions.includes(d.code))
      : defs.filter((d) => isAssignablePermission(d.code));
    const map = new Map<string, PermissionDef[]>();
    shown.forEach((d) => map.set(d.module, [...(map.get(d.module) ?? []), d]));
    return [...map.entries()];
  }, [catalog.data, readOnly, role]);

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      if (role) {
        await updateMut.mutateAsync({ id: role.id, version, ...values });
        onDone(`Đã cập nhật vai trò ${values.name.trim()}`);
      } else {
        await createMut.mutateAsync(values);
        onDone(`Đã tạo vai trò ${values.name.trim()}`);
      }
    } catch (e) {
      const problem = getProblem(e);
      const latest = conflictCurrent<Role>(e);
      if (problem?.code === 'version_conflict' && latest) {
        reset({ name: latest.name, permissions: latest.permissions });
        setVersion(latest.version);
        setError('Vai trò vừa được người khác sửa. Form đã hiện bản hiện tại, chưa có gì thay đổi.');
        return;
      }
      const fields = problem?.errors ?? {};
      if (problem?.code === 'role_name_taken') {
        setFieldError('name', { message: fields.name ?? 'Tên vai trò đã được dùng trong công ty' });
        return;
      }
      if (fields.name) setFieldError('name', { message: fields.name });
      if (fields.permissions) setFieldError('permissions', { message: fields.permissions });
      if (!fields.name && !fields.permissions) setError(problemMessage(e));
    }
  });

  const busy = createMut.isPending || updateMut.isPending;
  const title = readOnly ? `Vai trò ${role?.name ?? ''}` : role ? 'Sửa vai trò' : 'Tạo vai trò';

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {readOnly
              ? `${role?.permissions.length ?? 0} quyền, ${role?.memberCount ?? 0} tài khoản.${readOnlyReason ? ` ${readOnlyReason}` : ''}`
              : 'Chỉ chọn được những quyền bạn đang có. Quyền nền tảng (bật phân hệ, xem nhật ký) không gán cho vai trò tuỳ biến.'}
          </DialogDescription>
        </DialogHeader>

        {error && <AlertMessage severity="warning">{error}</AlertMessage>}
        {catalog.isError && (
          <AlertMessage severity="error">{getErrorMessage(catalog.error)}</AlertMessage>
        )}

        <Form {...form}>
          <form onSubmit={onSubmit} noValidate className="grid min-h-0 gap-4">
            {!readOnly && <FormTextField control={control} name="name" label="Tên vai trò" autoFocus />}
            <FormField
              control={control}
              name="permissions"
              render={({ field }) => (
                <FormItem>
                  {!readOnly && <FormLabel>Quyền</FormLabel>}
                  <div className="grid max-h-[50vh] gap-3 overflow-y-auto sm:grid-cols-2">
                    {catalog.isLoading && <Skeleton className="h-40 sm:col-span-2" />}
                    {groups.map(([module, defs]) => (
                      <fieldset key={module} className="rounded-md border p-3" data-module={module}>
                        <legend className="px-1 text-sm font-semibold">
                          {MODULE_LABELS[module as keyof typeof MODULE_LABELS] ?? module}
                        </legend>
                        <div className="grid gap-1.5">
                          {defs.map((d) => {
                            const notHeld = !readOnly && !held.has(d.code);
                            const disabled = readOnly || notHeld;
                            const id = `perm-${d.code}`;
                            return (
                              <BlockedReason key={d.code} reason={notHeld ? NOT_HELD : null}>
                              <label
                                htmlFor={id}
                                // Ô bị khoá không nhận focus: cho nhãn nhận Tab để đọc được lý do
                                tabIndex={notHeld ? 0 : undefined}
                                className={cn(
                                  'flex items-start gap-2 rounded-sm text-sm',
                                  disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
                                  readOnly && 'opacity-100',
                                )}
                              >
                                <Checkbox
                                  id={id}
                                  className="mt-0.5"
                                  value={d.code}
                                  disabled={disabled}
                                  checked={field.value.includes(d.code)}
                                  onCheckedChange={(checked) =>
                                    field.onChange(
                                      checked
                                        ? [...field.value, d.code]
                                        : field.value.filter((c) => c !== d.code),
                                    )
                                  }
                                />
                                <span className="grid">
                                  {d.label}
                                  <small className="font-mono text-xs text-muted-foreground">{d.code}</small>
                                </span>
                              </label>
                              </BlockedReason>
                            );
                          })}
                        </div>
                      </fieldset>
                    ))}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
                {readOnly ? 'Đóng' : 'Huỷ'}
              </Button>
              {!readOnly && (
                <Button type="submit" disabled={busy}>
                  {busy ? 'Đang lưu...' : 'Lưu'}
                </Button>
              )}
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
