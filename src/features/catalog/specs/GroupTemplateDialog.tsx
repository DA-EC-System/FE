import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Lock, Trash2 } from 'lucide-react';
import { AlertMessage } from '@/components/common/AlertMessage';
import { RowAction } from '@/components/common/RowAction';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
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
import { Skeleton } from '@/components/ui/skeleton';
import { useAttributes, useGroupTemplate, useSpecFields, useUpdateGroupTemplate } from '@/api/catalog.api';
import { getProblem } from '@/api/client';
import { problemCode, problemMessage } from '@/api/problemMessages';
import { isPlatform, type ProductGroup } from '@/types/catalog';
import { SPEC_INPUT_LABELS } from './specLabels';

interface GroupTemplateDialogProps {
  group: ProductGroup | null;
  onClose: () => void;
  onDone: (message: string) => void;
}

type Row = { fieldId: string; required: boolean };
const NONE = 'none';

/**
 * Mẫu của nhóm hàng (Documents/21 §5.5): tối đa hai trục phân loại chuẩn, thông số nào, bắt buộc hay tuỳ chọn, thứ
 * tự. Form tạo sản phẩm dựng theo mẫu. Bắt buộc chỉ tính vào mức sẵn sàng, không chặn lưu.
 * Nhóm chuẩn nền tảng (§5.6): trục và dòng của mẫu chuẩn khoá, kể cả dòng tuỳ chọn; công ty chỉ thêm, sắp, bỏ dòng của
 * mình, gửi `{ fields: chỉ dòng công ty, version }`
 */
export function GroupTemplateDialog({ group, onClose, onDone }: GroupTemplateDialogProps) {
  const templateQuery = useGroupTemplate(group?.id);
  const fieldsQuery = useSpecFields({ enabled: Boolean(group) });
  const attributes = useAttributes().data ?? [];
  const saveMut = useUpdateGroupTemplate();
  const [axes, setAxes] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [version, setVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState('');

  const template = templateQuery.data;
  const platform = Boolean(group && isPlatform(group));
  // Dòng của mẫu chuẩn: chỉ đọc, đứng trước dòng công ty
  const locked = platform ? (template?.fields ?? []).filter(isPlatform) : [];
  useEffect(() => {
    if (template) {
      setAxes(template.axes.map((a) => a.attributeId));
      const own = platform ? template.fields.filter((f) => !isPlatform(f)) : template.fields;
      setRows(own.map((f) => ({ fieldId: f.fieldId, required: f.required })));
      setVersion(template.version);
      setError(null);
    }
  }, [template, platform]);

  const library = fieldsQuery.data ?? [];
  const byId = new Map(library.map((f) => [f.id, f]));
  const free = library.filter((f) => !rows.some((r) => r.fieldId === f.id) && !locked.some((l) => l.fieldId === f.id));

  const setAxis = (i: number, id: string) =>
    setAxes((prev) => {
      const next = [...prev];
      if (id === NONE) return next.slice(0, i);
      next[i] = id;
      return next.filter(Boolean);
    });
  const move = (i: number, to: number) =>
    setRows((prev) => {
      const next = [...prev];
      const [row] = next.splice(i, 1);
      next.splice(to, 0, row);
      return next;
    });

  const save = async () => {
    if (!group) return;
    setError(null);
    try {
      await saveMut.mutateAsync(
        platform ? { groupId: group.id, fields: rows, version } : { groupId: group.id, axisAttributeIds: axes, fields: rows, version },
      );
      onDone(`Đã lưu mẫu của nhóm ${group.name}`);
    } catch (e) {
      if (problemCode(e) === 'version_conflict') {
        void templateQuery.refetch();
        setError('Mẫu vừa được người khác sửa. Đã nạp bản mới nhất, chưa có gì thay đổi.');
        return;
      }
      const errs = getProblem(e)?.errors ?? {};
      const first = Object.entries(errs)[0];
      // `fields.<i>.fieldId`: nêu tên thông số để biết dòng nào lỗi
      const at = first?.[0].match(/^fields\.(\d+)\./);
      const name = at ? byId.get(rows[Number(at[1])]?.fieldId ?? '')?.name : undefined;
      setError(first ? (name ? `${name}: ${first[1]}` : first[1]) : problemMessage(e));
    }
  };

  const busy = saveMut.isPending;
  const loading = templateQuery.isLoading || fieldsQuery.isLoading;

  return (
    <Dialog open={Boolean(group)} onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Mẫu của nhóm {group?.name}</DialogTitle>
          <DialogDescription>
            {platform
              ? 'Nhóm chuẩn của nền tảng: trục và thông số chuẩn dùng chung mọi công ty, không bỏ được. Thêm thông số riêng của công ty ở cuối mẫu.'
              : 'Chọn nhóm này khi tạo sản phẩm thì trục phân loại chọn sẵn và form hiện các thông số dưới đây.'}
          </DialogDescription>
        </DialogHeader>

        {error && <AlertMessage severity="warning">{error}</AlertMessage>}
        {templateQuery.isError && <AlertMessage severity="error">{problemMessage(templateQuery.error)}</AlertMessage>}

        {loading ? (
          <div className="grid gap-2">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <div className="grid min-h-0 gap-5 overflow-y-auto">
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-medium">Trục phân loại chuẩn</legend>
              {platform ? (
                <p className="flex flex-wrap items-center gap-1.5 text-sm">
                  <Lock className="size-3.5 text-muted-foreground" aria-hidden />
                  {template?.axes.length ? template.axes.map((a) => a.name).join(', ') : <span className="text-muted-foreground">Không có</span>}
                  <span className="text-muted-foreground">· do nền tảng đặt</span>
                </p>
              ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {[0, 1].map((i) => (
                  <div key={i} className="grid gap-1.5">
                    <Label htmlFor={`axis-${i}`} className="font-normal text-muted-foreground">
                      Trục {i + 1}
                    </Label>
                    <Select value={axes[i] ?? NONE} onValueChange={(v) => setAxis(i, v)} disabled={busy || (i === 1 && !axes[0])}>
                      <SelectTrigger id={`axis-${i}`} className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>Không có</SelectItem>
                        {attributes
                          .filter((a) => a.id === axes[i] || !axes.includes(a.id))
                          .map((a) => (
                            <SelectItem key={a.id} value={a.id}>
                              {a.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
              )}
              <p className="text-xs text-muted-foreground">
                Điều gì khác nhau giữa các SKU (màu, cỡ, dung tích) là trục, không phải thông số.
              </p>
            </fieldset>

            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-medium">Thông số ({locked.length + rows.length})</legend>
              {locked.length > 0 && (
                <>
                  <h3 className="text-xs font-medium text-muted-foreground">Chuẩn nền tảng · {locked.length}</h3>
                  <ol className="grid gap-1" aria-label="Thông số của mẫu chuẩn">
                    {locked.map((f) => (
                      <li key={f.fieldId} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-muted/50 px-3 py-1.5">
                        <Lock className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="font-medium">{f.name}</span>
                          <span className="ml-2 text-xs text-muted-foreground">{SPEC_INPUT_LABELS[f.input]}</span>
                        </span>
                        {f.required ? <Badge variant="secondary">Bắt buộc</Badge> : <span className="text-sm text-muted-foreground">Tuỳ chọn</span>}
                      </li>
                    ))}
                  </ol>
                  <h3 className="mt-2 text-xs font-medium text-muted-foreground">Của công ty · {rows.length}</h3>
                </>
              )}
              {rows.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  {platform ? 'Chưa thêm thông số riêng.' : 'Chưa có thông số nào.'} Thêm từ thư viện bên dưới.
                </p>
              )}
              <ol className="grid gap-1">
                {rows.map((r, i) => {
                  const f = byId.get(r.fieldId);
                  return (
                    <li key={r.fieldId} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border px-3 py-1.5">
                      <span className="min-w-0 flex-1">
                        <span className="font-medium">{f?.name ?? r.fieldId}</span>
                        {f && <span className="ml-2 text-xs text-muted-foreground">{SPEC_INPUT_LABELS[f.input]}</span>}
                      </span>
                      <label className="flex min-h-6 items-center gap-2 text-sm">
                        <Checkbox
                          checked={r.required}
                          disabled={busy}
                          onCheckedChange={(v) =>
                            setRows((prev) => prev.map((x, j) => (j === i ? { ...x, required: v === true } : x)))
                          }
                        />
                        Bắt buộc
                      </label>
                      <span className="flex">
                        <RowAction label="Lên trên" reason={i === 0 ? 'Đã ở đầu' : null} onClick={() => move(i, i - 1)}>
                          <ArrowUp />
                        </RowAction>
                        <RowAction label="Xuống dưới" reason={i === rows.length - 1 ? 'Đã ở cuối' : null} onClick={() => move(i, i + 1)}>
                          <ArrowDown />
                        </RowAction>
                        <RowAction
                          label="Bỏ khỏi mẫu"
                          destructive
                          onClick={() => setRows((prev) => prev.filter((_, j) => j !== i))}
                        >
                          <Trash2 />
                        </RowAction>
                      </span>
                    </li>
                  );
                })}
              </ol>
              {free.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <Select value={adding} onValueChange={setAdding} disabled={busy}>
                    <SelectTrigger className="w-full sm:w-72" aria-label="Thông số trong thư viện">
                      <SelectValue placeholder="Chọn thông số trong thư viện" />
                    </SelectTrigger>
                    <SelectContent>
                      {free.map((f) => (
                        <SelectItem key={f.id} value={f.id}>
                          {f.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!adding || busy}
                    onClick={() => {
                      setRows((prev) => [...prev, { fieldId: adding, required: false }]);
                      setAdding('');
                    }}
                  >
                    Thêm vào mẫu
                  </Button>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Bắt buộc nghĩa là mọi sàn đều cần. Thiếu vẫn lưu được, sản phẩm chỉ chưa "Sẵn sàng". Thông số chỉ một sàn
                đòi thì để tuỳ chọn: sàn đó tự báo thiếu khi đẩy.
              </p>
            </fieldset>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            Huỷ
          </Button>
          <Button type="button" onClick={save} disabled={busy || loading || !template}>
            {busy ? 'Đang lưu...' : 'Lưu mẫu'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
