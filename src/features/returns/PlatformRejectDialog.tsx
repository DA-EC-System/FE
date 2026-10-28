import { useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { AlertMessage } from '@/components/common/AlertMessage';
import { AttachmentField, type AttachmentItem } from '@/components/common/AttachmentField';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useReturnCommand, useReturnReasons } from '@/api/returns.api';
import { getProblem } from '@/api/client';
import { problemMessage } from '@/api/problemMessages';
import { conflictCurrent } from '@/features/identity/shared';
import type { ReturnRequest } from '@/types/returns';
import { MAX_REASON } from './shared';

const platformRejectSchema = z.object({
  reasonId: z.string().min(1, 'Chọn lý do từ chối'),
  comment: z.string().trim().max(MAX_REASON, `Ghi chú tối đa ${MAX_REASON} ký tự`),
});

type PlatformRejectForm = z.infer<typeof platformRejectSchema>;

interface PlatformRejectDialogProps {
  request: ReturnRequest;
  open: boolean;
  onClose: () => void;
}

/**
 * Từ chối yêu cầu trả từ sàn (§20.1): lý do chọn theo danh sách của sàn,
 * lý do sàn đòi bằng chứng thì bắt buộc đính kèm ảnh.
 */
export function PlatformRejectDialog({ request, open, onClose }: PlatformRejectDialogProps) {
  const reasons = useReturnReasons(request.id, 'reject', open);
  const command = useReturnCommand();
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | undefined>();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<PlatformRejectForm>({
    resolver: zodResolver(platformRejectSchema),
    defaultValues: { reasonId: '', comment: '' },
  });
  const { reset } = form;

  useEffect(() => {
    if (open) {
      reset({ reasonId: '', comment: '' });
      setAttachments([]);
      setAttachmentError(undefined);
      setError(null);
    }
  }, [open, reset]);

  const reasonId = useWatch({ control: form.control, name: 'reasonId' });
  const picked = reasons.data?.items.find((r) => r.id === reasonId);

  const submit = async ({ reasonId, comment }: PlatformRejectForm) => {
    setError(null);
    setAttachmentError(undefined);
    if (picked?.requiresImage && attachments.length === 0) {
      setAttachmentError('Lý do này cần ảnh làm bằng chứng');
      return;
    }
    try {
      await command.mutateAsync({
        id: request.id,
        version: request.version,
        command: { kind: 'reject', reasonId, ...(comment ? { comment } : {}), attachmentIds: attachments.map((a) => a.fileId) },
      });
      toast.success(`${request.code}: Từ chối`);
      onClose();
    } catch (e) {
      if (conflictCurrent<ReturnRequest>(e)) toast.warning('Yêu cầu vừa được cập nhật, đã tải lại');
      const errors = getProblem(e)?.errors ?? {};
      if (errors.reasonId) form.setError('reasonId', { message: errors.reasonId });
      if (errors.comment) form.setError('comment', { message: errors.comment });
      if (errors.attachmentIds) setAttachmentError(errors.attachmentIds);
      if (!errors.reasonId && !errors.comment && !errors.attachmentIds) setError(problemMessage(e));
    }
  };

  const loading = command.isPending;
  return (
    <Dialog open={open} onOpenChange={(next) => !next && !loading && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Từ chối yêu cầu {request.code}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(submit)} noValidate className="grid gap-4">
            <AlertMessage severity="info">Khách có thể khiếu nại lên sàn. Sàn xử cho khách thì yêu cầu mở lại.</AlertMessage>
            {error && <AlertMessage severity="error">{error}</AlertMessage>}
            {reasons.isError && <AlertMessage severity="error">{problemMessage(reasons.error)}</AlertMessage>}
            {reasons.isLoading && <Skeleton className="h-24 w-full" />}
            {reasons.data && (
              <FormField
                control={form.control}
                name="reasonId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Lý do từ chối (theo sàn)</FormLabel>
                    <FormControl>
                      <RadioGroup value={field.value} onValueChange={field.onChange} aria-label="Lý do từ chối">
                        {reasons.data.items.map((r) => (
                          <div key={r.id} className="flex items-center gap-3">
                            <RadioGroupItem id={`reject-reason-${r.id}`} value={r.id} />
                            <Label htmlFor={`reject-reason-${r.id}`} className="font-normal">
                              {r.label}
                              {r.requiresImage && <span className="text-muted-foreground"> (cần ảnh)</span>}
                            </Label>
                          </div>
                        ))}
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            <FormField
              control={form.control}
              name="comment"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Ghi chú gửi sàn</FormLabel>
                  <FormControl>
                    <Textarea rows={2} maxLength={MAX_REASON} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid gap-2">
              <Label>Ảnh bằng chứng{picked?.requiresImage ? ' (bắt buộc)' : ''}</Label>
              <AttachmentField
                value={attachments}
                onChange={(next) => {
                  setAttachments(next);
                  setAttachmentError(undefined);
                }}
                onBusyChange={setUploading}
                disabled={loading}
                error={attachmentError}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
                Đóng
              </Button>
              <Button type="submit" variant="destructive" disabled={loading || uploading || !reasons.data}>
                {loading ? 'Đang gửi...' : 'Từ chối'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
