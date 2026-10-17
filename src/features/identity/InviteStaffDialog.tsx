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
import { Form, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useInviteStaff, useSetStaffRoles } from '@/api/identity.api';
import { getProblem } from '@/api/client';
import { problemMessage } from '@/api/problemMessages';
import { useAuth } from '@/hooks/useAuth';
import type { Role, StaffMember } from '@/types/identity';
import { RoleChecklist } from './RoleChecklist';
import { conflictCurrent, inviteSchema, protectedReason, type InviteForm } from './shared';

interface InviteStaffDialogProps {
  open: boolean;
  roles: Role[];
  onClose: () => void;
  onDone: (message: string) => void;
}

const EMPTY: InviteForm = { email: '', fullName: '', roleIds: [] };

/** UC-PI-05: thêm tài khoản nhân viên, gửi thư mời kèm mật khẩu */
export function InviteStaffDialog({ open, roles, onClose, onDone }: InviteStaffDialogProps) {
  const { account } = useAuth();
  const invite = useInviteStaff();
  const setRoles = useSetStaffRoles();
  const [error, setError] = useState<string | null>(null);
  // Email đã có tài khoản trong công ty: hỏi có thêm vai trò vừa chọn không (docs/21 I2)
  const [existing, setExisting] = useState<StaffMember | null>(null);

  const form = useForm<InviteForm>({ resolver: zodResolver(inviteSchema), defaultValues: EMPTY });
  const { control, reset, getValues, setError: setFieldError } = form;

  useEffect(() => {
    if (open) {
      reset(EMPTY);
      setError(null);
      setExisting(null);
    }
  }, [open, reset]);

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      const res = await invite.mutateAsync(values);
      // Tài khoản sẵn có: không nhắc mật khẩu, không nêu công ty khác (AC-4)
      onDone(
        res.outcome === 'invited'
          ? `Đã tạo tài khoản và gửi thư mời tới ${res.member.email}`
          : `Đã thêm ${res.member.fullName} (${res.member.email}) vào công ty`,
      );
    } catch (e) {
      const problem = getProblem(e);
      const member = conflictCurrent<StaffMember>(e, 'member');
      if (problem?.code === 'already_member' && member) {
        setExisting(member);
        return;
      }
      const fields = problem?.errors ?? {};
      const known = (['email', 'fullName', 'roleIds'] as const).filter((name) => fields[name]);
      known.forEach((name) => setFieldError(name, { message: fields[name] }));
      if (!known.length) setError(problemMessage(e));
    }
  });

  const addRolesToExisting = async () => {
    if (!existing) return;
    const roleIds = [...new Set([...existing.roles.map((r) => r.id), ...getValues('roleIds')])];
    try {
      await setRoles.mutateAsync({ accountId: existing.accountId, roleIds, version: existing.version });
      onDone(`Đã thêm vai trò cho ${existing.fullName} (${existing.email})`);
    } catch (e) {
      setExisting(null);
      setError(problemMessage(e));
    }
  };

  const busy = invite.isPending || setRoles.isPending;
  const lockedReason = existing ? protectedReason(existing, account?.id) : null;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Thêm nhân viên</DialogTitle>
          <DialogDescription>
            Hệ thống sinh mật khẩu ngẫu nhiên và gửi thư mời tới email. Nhân viên phải đổi mật khẩu ở
            lần đăng nhập đầu.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <AlertMessage severity="error" onClose={() => setError(null)}>
            {error}
          </AlertMessage>
        )}

        {existing ? (
          <div className="grid gap-4" data-testid="already-member">
            <AlertMessage severity="warning">
              <p>
                <strong>{existing.email}</strong> đã có tài khoản trong công ty
                {existing.roles.length > 0 && (
                  <> với vai trò {existing.roles.map((r) => r.name).join(', ')}</>
                )}
                .
              </p>
              <p className="mt-1">
                {lockedReason
                  ? `${lockedReason}, nên không đổi được vai trò.`
                  : 'Thêm các vai trò vừa chọn cho tài khoản này, ngoài các vai trò đang có?'}
              </p>
            </AlertMessage>
            <DialogFooter>
              <Button variant="outline" onClick={() => setExisting(null)} disabled={busy}>
                {lockedReason ? 'Quay lại' : 'Không'}
              </Button>
              {!lockedReason && (
                <Button onClick={addRolesToExisting} disabled={busy}>
                  {setRoles.isPending ? 'Đang lưu...' : 'Thêm vai trò'}
                </Button>
              )}
            </DialogFooter>
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={onSubmit} noValidate className="grid gap-4">
              <FormTextField control={control} name="email" label="Email" type="email" autoFocus />
              <FormTextField control={control} name="fullName" label="Họ tên" />
              <FormField
                control={control}
                name="roleIds"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Vai trò</FormLabel>
                    <div className="max-h-64 overflow-y-auto rounded-md border p-1">
                      <RoleChecklist roles={roles} value={field.value} onChange={field.onChange} />
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
                  Huỷ
                </Button>
                <Button type="submit" disabled={busy}>
                  {invite.isPending ? 'Đang lưu...' : 'Lưu và gửi thư mời'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
