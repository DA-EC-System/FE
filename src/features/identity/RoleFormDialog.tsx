import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertMessage } from '@/components/common/AlertMessage';
import { BlockedReason } from '@/components/common/BlockedReason';
import { FormTextField } from '@/components/common/FormTextField';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
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

/** Bỏ dấu, viết thường để tìm quyền không cần gõ dấu */
const fold = (v: string) =>
  v
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();

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
  const [search, setSearch] = useState('');

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
      setSearch('');
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

  const assignableCount = useMemo(() => groups.reduce((n, [, defs]) => n + defs.length, 0), [groups]);
  const term = fold(search.trim());
  const visibleGroups = useMemo(
    () =>
      term
        ? groups
            .map(([module, defs]) => {
              const moduleHit = fold(MODULE_LABELS[module as keyof typeof MODULE_LABELS] ?? module).includes(term);
              return [
                module,
                moduleHit ? defs : defs.filter((d) => fold(d.label).includes(term) || d.code.includes(term)),
              ] as const;
            })
            .filter(([, defs]) => defs.length > 0)
        : groups,
    [groups, term],
  );

  const selected = form.watch('permissions');
  // Sửa vai trò đang có người mang: nêu trước số quyền thêm, bỏ và số tài khoản bị ảnh hưởng
  const diff = useMemo(() => {
    if (!role || readOnly) return null;
    const before = new Set(role.permissions);
    const after = new Set(selected);
    const added = selected.filter((c) => !before.has(c)).length;
    const removed = role.permissions.filter((c) => !after.has(c)).length;
    if (!added && !removed) return null;
    const parts = [added ? `thêm ${added} quyền` : null, removed ? `bỏ ${removed} quyền` : null];
    const text = parts.filter(Boolean).join(', ');
    return { text: text.charAt(0).toUpperCase() + text.slice(1) };
  }, [role, readOnly, selected]);

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
                  {!readOnly && (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                      <FormLabel>Quyền</FormLabel>
                      <span className="text-sm text-muted-foreground tabular-nums" aria-live="polite" data-testid="role-perm-count">
                        {field.value.length}/{assignableCount} quyền đã chọn
                      </span>
                      <Input
                        type="search"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Tìm quyền hoặc phân hệ"
                        aria-label="Tìm quyền"
                        className="ms-auto h-8 w-full sm:w-56"
                      />
                    </div>
                  )}
                  {readOnly ? (
                    <div className="grid max-h-[50vh] gap-x-6 gap-y-4 overflow-y-auto sm:grid-cols-2" data-testid="role-perm-list">
                      {catalog.isLoading && <Skeleton className="h-40 sm:col-span-2" />}
                      {groups.map(([module, defs]) => (
                        <section key={module} data-module={module}>
                          <h3 className="mb-1.5 text-sm font-semibold">
                            {MODULE_LABELS[module as keyof typeof MODULE_LABELS] ?? module}
                          </h3>
                          <ul className="grid gap-1 text-sm">
                            {defs.map((d) => (
                              <li key={d.code} title={d.code} className="flex items-start gap-2">
                                <span aria-hidden className="mt-[7px] size-1.5 shrink-0 rounded-full bg-primary" />
                                {d.label}
                              </li>
                            ))}
                          </ul>
                        </section>
                      ))}
                    </div>
                  ) : (
                  <div className="grid max-h-[50vh] gap-3 overflow-y-auto sm:grid-cols-2">
                    {catalog.isLoading && <Skeleton className="h-40 sm:col-span-2" />}
                    {!catalog.isLoading && visibleGroups.length === 0 && (
                      <p className="py-6 text-center text-sm text-muted-foreground sm:col-span-2">
                        Không có quyền nào khớp "{search.trim()}"
                      </p>
                    )}
                    {visibleGroups.map(([module, defs]) => {
                      const pickable = defs.filter((d) => held.has(d.code)).map((d) => d.code);
                      const allOn = pickable.length > 0 && pickable.every((c) => field.value.includes(c));
                      const moduleLabel = MODULE_LABELS[module as keyof typeof MODULE_LABELS] ?? module;
                      return (
                      <fieldset key={module} className="rounded-md border p-3" data-module={module}>
                        <legend className="px-1 text-sm font-semibold">{moduleLabel}</legend>
                        {pickable.length > 1 && (
                          <Button
                            type="button"
                            variant="link"
                            size="sm"
                            className="-mt-1 mb-1 h-auto p-0 text-xs"
                            aria-label={`${allOn ? 'Bỏ chọn' : 'Chọn'} mọi quyền nhóm ${moduleLabel}`}
                            onClick={() =>
                              field.onChange(
                                allOn
                                  ? field.value.filter((c) => !pickable.includes(c))
                                  : [...new Set([...field.value, ...pickable])],
                              )
                            }
                          >
                            {allOn ? 'Bỏ chọn cả nhóm' : 'Chọn cả nhóm'}
                          </Button>
                        )}
                        <div className="grid gap-1.5">
                          {defs.map((d) => {
                            const notHeld = !held.has(d.code);
                            const disabled = notHeld;
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
                      );
                    })}
                  </div>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />
            {diff && (role?.memberCount ?? 0) > 0 && (
              <div data-testid="role-diff">
                <AlertMessage severity="info">
                  {diff.text}. Áp dụng cho {role?.memberCount} tài khoản đang mang vai trò này từ lần thao tác kế
                  tiếp của họ.
                </AlertMessage>
              </div>
            )}
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
