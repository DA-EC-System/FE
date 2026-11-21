import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AlertMessage } from '@/components/common/AlertMessage';
import { RowTextAction } from '@/components/common/RowAction';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  useAttributeCatalog,
  useSaveSpecMapping,
  useSpecMappings,
  type MappedOption,
} from '@/api/channelSpecMappings.api';
import { getProblem } from '@/api/client';
import { problemMessage } from '@/api/problemMessages';
import { isPlatform, type SpecField } from '@/types/catalog';
import { PLATFORM_TABS } from '../platformCategory';
import { AttributeCodePicker } from './AttributeCodePicker';
import { hasOptions } from './specLabels';

interface CodeDraft {
  attributeCode: string;
  attributeLabel: string;
  /** optionId của công ty → id lựa chọn của sàn */
  options: Record<string, string | null>;
}

const toOptionMap = (opts: MappedOption[]) => Object.fromEntries(opts.map((o) => [o.optionId, o.platformOptionId]));
const NONE = '__none';

interface SpecMappingDialogProps {
  field: SpecField | null;
  canEdit: boolean;
  onClose: () => void;
}

/**
 * Ánh xạ một thông số sang attribute của từng sàn (Documents/21 §18.8.1). Nhiều mã theo thứ tự ưu tiên: khi đẩy, dùng
 * mã đầu tiên mà category đang chọn có. Mỗi mã của một sàn chỉ nhận từ một thông số.
 * Thông số chuẩn (§18.8.1 "Hai tầng"): tập mã và ghép của lựa chọn chuẩn do nền tảng đặt, chỉ đọc; công ty chỉ ghép
 * lựa chọn riêng của mình, PUT gửi đúng tập mã đang có
 */
export function SpecMappingDialog({ field, canEdit, onClose }: SpecMappingDialogProps) {
  return (
    <Dialog open={Boolean(field)} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Ánh xạ {field?.name} sang sàn</DialogTitle>
          <DialogDescription>{MAPPING_HINT(field?.name ?? '')}</DialogDescription>
        </DialogHeader>
        {field && <SpecMappingTabs field={field} canEdit={canEdit} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

export const MAPPING_HINT = (name: string) =>
  `Khi đăng sản phẩm, giá trị ${name} tự điền vào attribute đã ánh xạ. Category khác nhau có thể dùng mã khác nhau: xếp nhiều mã theo thứ tự ưu tiên.`;

/** Ánh xạ một thuộc tính sản phẩm, mỗi sàn một tab; nhúng được vào trang (không có `onClose` thì lưu xong ở lại) */
export function SpecMappingTabs({ field, canEdit, onClose }: { field: SpecField; canEdit: boolean; onClose?: () => void }) {
  const [platform, setPlatform] = useState<string>(PLATFORM_TABS[0].platform);
  return (
    <Tabs value={platform} onValueChange={setPlatform} className="min-h-0">
      <TabsList>
        {PLATFORM_TABS.map((t) => (
          <TabsTrigger key={t.platform} value={t.platform}>
            {t.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {PLATFORM_TABS.map((t) => (
        <TabsContent key={t.platform} value={t.platform} className="min-h-0 overflow-y-auto">
          <PlatformMapping field={field} platform={t.platform} platformName={t.label} canEdit={canEdit} onClose={onClose} />
        </TabsContent>
      ))}
    </Tabs>
  );
}

function PlatformMapping({
  field,
  platform,
  platformName,
  canEdit,
  onClose,
}: {
  field: SpecField;
  platform: string;
  platformName: string;
  canEdit: boolean;
  onClose?: () => void;
}) {
  const query = useSpecMappings(platform);
  const saveMut = useSaveSpecMapping(platform);
  const row = query.data?.find((m) => m.fieldId === field.id);
  const [codes, setCodes] = useState<CodeDraft[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCodes(
      [...(row?.codes ?? [])]
        .sort((a, b) => a.priority - b.priority)
        .map((c) => ({ attributeCode: c.attributeCode, attributeLabel: c.attributeLabel, options: toOptionMap(c.options) })),
    );
    setErrors({});
    setError(null);
  }, [row]);

  const withOptions = hasOptions(field.input);
  // Thiếu `editable`: suy theo tầng của thông số (thiếu `scope` là chuẩn, chỉ đọc)
  const codesEditable = canEdit && (row?.editable ?? !isPlatform(field));
  const optionEditable = (optionId: string) =>
    canEdit && (codesEditable || field.options.find((o) => o.id === optionId)?.scope === 'company');
  const anyEditable = codesEditable || (canEdit && withOptions && field.options.some((o) => o.scope === 'company'));
  const suggestions = (row?.suggestions ?? []).filter((s) => !codes.some((c) => c.attributeCode === s.attributeCode));
  const move = (i: number, to: number) =>
    setCodes((prev) => {
      const next = [...prev];
      const [c] = next.splice(i, 1);
      next.splice(to, 0, c);
      return next;
    });

  const save = async () => {
    setError(null);
    setErrors({});
    try {
      await saveMut.mutateAsync({
        fieldId: field.id,
        codes: codes.map((c) => ({
          attributeCode: c.attributeCode,
          ...(withOptions && {
            // Thông số chuẩn: chỉ gửi lựa chọn riêng của công ty
            options: field.options
              .filter((o) => codesEditable || optionEditable(o.id))
              .map((o) => ({ optionId: o.id, platformOptionId: c.options[o.id] ?? null })),
          }),
        })),
      });
      toast.success(`Đã lưu ánh xạ ${field.name} sang ${platformName}`);
      onClose?.();
    } catch (e) {
      const errs = getProblem(e)?.errors ?? {};
      // codes.<i>.attributeCode: mã trùng, hoặc mã đã ánh xạ cho thông số khác
      const byCode: Record<string, string> = {};
      for (const [k, m] of Object.entries(errs)) {
        const hit = /^codes\.(\d+)/.exec(k);
        const code = hit ? codes[Number(hit[1])]?.attributeCode : undefined;
        if (code) byCode[code] = m;
      }
      setErrors(byCode);
      if (!Object.keys(byCode).length) setError(problemMessage(e));
    }
  };

  if (query.isLoading) return <Skeleton className="mt-3 h-32 w-full" />;
  if (query.isError) return <AlertMessage severity="error" className="mt-3">{problemMessage(query.error)}</AlertMessage>;

  return (
    <div className="mt-3 grid gap-4">
      {error && <AlertMessage severity="warning">{error}</AlertMessage>}
      {!codesEditable && isPlatform(field) && (
        <p className="text-sm text-muted-foreground">
          Thông số chuẩn: mã {platformName} do nền tảng đặt, công ty không đổi được.
          {anyEditable && ' Công ty ghép được lựa chọn riêng của mình.'}
        </p>
      )}
      {codes.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Chưa ánh xạ sang {platformName}. Khi đẩy, ô này để trống và người dùng tự điền ở tab {platformName}.
        </p>
      )}
      <ol className="grid gap-3">
        {codes.map((c, i) => (
          <li key={c.attributeCode} className="grid gap-2 rounded-md border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{i + 1}</Badge>
              <span className="font-medium">{c.attributeLabel}</span>
              <span className="font-mono text-xs text-muted-foreground">{c.attributeCode}</span>
              {codesEditable && (
                <span className="ml-auto flex">
                  <RowTextAction label={`Ưu tiên ${c.attributeCode} hơn`} reason={i === 0 ? 'Đã ưu tiên nhất' : null} onClick={() => move(i, i - 1)}>
                    Lên
                  </RowTextAction>
                  <RowTextAction label={`Ưu tiên ${c.attributeCode} kém hơn`} reason={i === codes.length - 1 ? 'Đã ở cuối' : null} onClick={() => move(i, i + 1)}>
                    Xuống
                  </RowTextAction>
                  <RowTextAction label={`Bỏ mã ${c.attributeCode}`} destructive onClick={() => setCodes((prev) => prev.filter((_, j) => j !== i))}>
                    Bỏ
                  </RowTextAction>
                </span>
              )}
            </div>
            {errors[c.attributeCode] && <p className="text-sm text-destructive">{errors[c.attributeCode]}</p>}
            {withOptions && field.options.length > 0 && (
              <OptionMap
                platform={platform}
                code={c}
                field={field}
                editable={optionEditable}
                onChange={(optionId, platformOptionId) =>
                  setCodes((prev) =>
                    prev.map((x, j) => (j === i ? { ...x, options: { ...x.options, [optionId]: platformOptionId } } : x)),
                  )
                }
              />
            )}
          </li>
        ))}
      </ol>

      {codesEditable && suggestions.length > 0 && (
        <div className="grid gap-2 rounded-md border border-dashed p-3">
          <p className="text-sm font-medium">Gợi ý theo tên, chưa lưu</p>
          {suggestions.map((s) => (
            <div key={s.attributeCode} className="flex flex-wrap items-center gap-2 text-sm">
              <span>{s.attributeLabel}</span>
              <span className="font-mono text-xs text-muted-foreground">{s.attributeCode}</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="ml-auto"
                onClick={() =>
                  setCodes((prev) => [
                    ...prev,
                    { attributeCode: s.attributeCode, attributeLabel: s.attributeLabel, options: toOptionMap(s.options) },
                  ])
                }
              >
                Dùng mã này
              </Button>
            </div>
          ))}
        </div>
      )}

      {codesEditable && (
        <AttributeCodePicker
          platform={platform}
          platformName={platformName}
          kind="property"
          exclude={codes.map((c) => c.attributeCode)}
          onPick={(a) => setCodes((prev) => [...prev, { attributeCode: a.code, attributeLabel: a.label, options: {} }])}
        />
      )}
      <p className="text-xs text-muted-foreground">Mỗi mã của {platformName} chỉ nhận từ một thông số.</p>

      <DialogFooter>
        {onClose && (
          <Button type="button" variant="outline" onClick={onClose} disabled={saveMut.isPending}>
            {anyEditable ? 'Huỷ' : 'Đóng'}
          </Button>
        )}
        {anyEditable && codes.length > 0 && (
          <Button type="button" onClick={save} disabled={saveMut.isPending}>
            {saveMut.isPending ? 'Đang lưu...' : `Lưu ánh xạ ${platformName}`}
          </Button>
        )}
      </DialogFooter>
    </div>
  );
}

/** Ghép từng lựa chọn của công ty với lựa chọn của sàn; lựa chọn sàn lấy từ attribute-catalog theo mã */
function OptionMap({
  platform,
  code,
  field,
  editable,
  onChange,
}: {
  platform: string;
  code: CodeDraft;
  field: SpecField;
  /** Lựa chọn nào công ty ghép được */
  editable: (optionId: string) => boolean;
  onChange: (optionId: string, platformOptionId: string | null) => void;
}) {
  const catalog = useAttributeCatalog(platform, code.attributeCode, 'property');
  const platformOptions = catalog.data?.find((a) => a.code === code.attributeCode)?.options ?? [];
  const mapped = field.options.filter((o) => code.options[o.id]).length;

  return (
    <details className="text-sm">
      <summary className="min-h-6 cursor-pointer text-foreground-2">
        Ghép lựa chọn ({mapped}/{field.options.length})
      </summary>
      {platformOptions.length === 0 ? (
        <p className="mt-2 text-muted-foreground">Attribute này nhập tự do trên sàn: gửi nguyên chữ của lựa chọn.</p>
      ) : (
        <div className="mt-2 grid gap-1.5">
          {[...field.options]
            .sort((a, b) => a.position - b.position)
            .map((o) => (
              <div key={o.id} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-2">
                <span className="truncate">
                  {o.value}
                  {isPlatform(field) && o.scope === 'company' && <span className="ml-1.5 text-xs text-muted-foreground">riêng</span>}
                </span>
                <Select
                  value={code.options[o.id] ?? NONE}
                  disabled={!editable(o.id)}
                  onValueChange={(v) => onChange(o.id, v === NONE ? null : v)}
                >
                  <SelectTrigger className="h-8 w-full" aria-label={`Lựa chọn sàn cho ${o.value}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Chưa ghép</SelectItem>
                    {platformOptions.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
        </div>
      )}
    </details>
  );
}
