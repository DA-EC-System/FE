import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Check, Copy } from 'lucide-react';
import { AlertMessage } from '@/components/common/AlertMessage';
import { Button } from '@/components/ui/button';
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
import { useCreateInvitation } from '@/api/identity.api';
import { getProblem } from '@/api/client';
import { problemMessage } from '@/api/problemMessages';
import { formatDateTime } from '@/utils/format';
import type { CreatedInvitation, Role } from '@/types/identity';
import { RoleChecklist } from './RoleChecklist';
import { inviteSchema, type InviteForm } from './shared';

interface InviteStaffDialogProps {
  open: boolean;
  roles: Role[];
  onClose: () => void;
  /**
   * Mời với một vai trò cố định, không cho chọn (wizard bước 7 mời Nhân viên kho, FE#468). `fixedRole.hint` là câu
   * dẫn thay câu mặc định.
   */
  fixedRole?: { id: string; name: string; hint: string };
}

const EMPTY: InviteForm = { roleIds: [] };

/**
 * US-CT-05: tạo link mời kèm vai trò sẽ gán. Nhân viên tự mở link, xác minh email, đặt mật khẩu
 * rồi chờ duyệt ở tab Yêu cầu tham gia. Link chỉ hiện một lần (BE không lưu token).
 */
export function InviteStaffDialog({ open, roles, onClose, fixedRole }: InviteStaffDialogProps) {
  const create = useCreateInvitation();
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedInvitation | null>(null);
  const [copied, setCopied] = useState(false);
  // Trình duyệt chặn clipboard: hướng dẫn tự Ctrl+C, không phải lỗi nên hiện ô cảnh báo
  const [copyHint, setCopyHint] = useState<string | null>(null);
  // Bấm đóng khi chưa sao chép: hỏi lại vì link không xem lại được
  const [confirmClose, setConfirmClose] = useState(false);
  const linkRef = useRef<HTMLInputElement>(null);

  // Theo id, không theo object: nơi gọi truyền object mới mỗi lần vẽ thì không xoá link vừa tạo
  const fixedRoleId = fixedRole?.id;
  const form = useForm<InviteForm>({ resolver: zodResolver(inviteSchema), defaultValues: EMPTY });
  const { control, reset, setError: setFieldError } = form;

  useEffect(() => {
    if (open) {
      reset(fixedRoleId ? { roleIds: [fixedRoleId] } : EMPTY);
      setError(null);
      setCreated(null);
      setCopied(false);
      setCopyHint(null);
      setConfirmClose(false);
    }
  }, [open, reset, fixedRoleId]);

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      setCreated(await create.mutateAsync(values.roleIds));
    } catch (e) {
      const message = getProblem(e)?.errors?.roleIds;
      if (message) setFieldError('roleIds', { message });
      else setError(problemMessage(e));
    }
  });

  const copy = async () => {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.link);
    } catch {
      // Trình duyệt chặn clipboard (http, iframe): bôi đen để người dùng tự Ctrl+C
      linkRef.current?.select();
      setCopyHint('Trình duyệt không cho sao chép tự động. Link đã được bôi đen, bấm Ctrl+C để sao chép.');
      return;
    }
    setCopyHint(null);
    setCopied(true);
    setConfirmClose(false);
  };

  const requestClose = () => {
    if (create.isPending) return;
    if (created && !copied && !confirmClose) {
      setConfirmClose(true);
      return;
    }
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && requestClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{created ? 'Link mời đã tạo' : fixedRole ? `Mời ${fixedRole.name.toLowerCase()}` : 'Mời nhân viên bằng link'}</DialogTitle>
          <DialogDescription>
            {created
              ? 'Gửi link này cho nhân viên qua kênh bạn tin cậy. Họ mở link, xác minh email và đặt mật khẩu; bạn duyệt ở tab Yêu cầu tham gia thì họ mới vào được công ty.'
              : fixedRole
                ? `${fixedRole.hint} Mỗi link dùng cho một người, hạn 72 giờ.`
                : 'Chọn vai trò sẽ gán cho người được mời. Mỗi link dùng cho một người, hạn 72 giờ.'}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <AlertMessage severity="error" onClose={() => setError(null)}>
            {error}
          </AlertMessage>
        )}
        {copyHint && (
          <AlertMessage severity="warning" onClose={() => setCopyHint(null)}>
            {copyHint}
          </AlertMessage>
        )}

        {created ? (
          <div className="grid gap-4" data-testid="invitation-link">
            <div className="flex gap-2">
              <Input
                ref={linkRef}
                readOnly
                value={created.link}
                aria-label="Link mời"
                onFocus={(e) => e.currentTarget.select()}
                className="font-mono text-xs"
              />
              <Button type="button" variant={copied ? 'outline' : 'default'} onClick={copy}>
                {copied ? <Check /> : <Copy />}
                {copied ? 'Đã sao chép' : 'Sao chép'}
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">Hết hạn lúc {formatDateTime(created.expiresAt)}.</p>
            <AlertMessage severity="warning">
              {confirmClose
                ? 'Bạn chưa sao chép link. Đóng hộp thoại thì không xem lại được link này, phải tạo link mới.'
                : 'Link chỉ hiện một lần. Đóng hộp thoại thì không xem lại được.'}
            </AlertMessage>
            <DialogFooter>
              <Button type="button" variant={confirmClose ? 'destructive' : 'outline'} onClick={requestClose}>
                {confirmClose ? 'Vẫn đóng' : 'Đóng'}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={onSubmit} noValidate className="grid gap-4">
              {fixedRole ? (
                <p className="text-sm">
                  Vai trò: <b className="font-semibold">{fixedRole.name}</b>
                </p>
              ) : (
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
              )}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={onClose} disabled={create.isPending}>
                  Huỷ
                </Button>
                <Button type="submit" disabled={create.isPending}>
                  {create.isPending ? 'Đang tạo...' : 'Tạo link mời'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
