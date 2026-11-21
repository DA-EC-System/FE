import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AlertMessage } from '@/components/common/AlertMessage';
import { RowTextAction } from '@/components/common/RowAction';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAxisMappings, useSaveAxisMapping } from '@/api/channelSpecMappings.api';
import { getProblem } from '@/api/client';
import { problemMessage } from '@/api/problemMessages';
import type { Attribute } from '@/types/catalog';
import { PLATFORM_TABS } from '../platformCategory';
import { AttributeCodePicker } from './AttributeCodePicker';

type Code = { attributeCode: string; attributeLabel: string };

/** Dòng "Trục trên sàn" của một thuộc tính: mã đã ánh xạ, hoặc mặc định của sàn theo loại chuẩn */
export function AxisMappingLine({ attribute, platform, label }: { attribute: Attribute; platform: string; label: string }) {
  const query = useAxisMappings(platform);
  const row = query.data?.find((m) => m.attributeId === attribute.id);
  const codes = [...(row?.codes ?? [])].sort((a, b) => a.priority - b.priority);
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-sm">
      <span className="w-20 shrink-0 text-xs text-muted-foreground">{label}</span>
      {query.isLoading ? (
        <span className="text-muted-foreground">…</span>
      ) : query.data === null ? (
        <span className="text-xs text-muted-foreground">Chưa hỗ trợ</span>
      ) : codes.length ? (
        <Badge variant="secondary">{codes[0].attributeLabel}</Badge>
      ) : row?.defaultCodes.length ? (
        <span className="text-xs text-foreground-2">Mặc định của sàn</span>
      ) : (
        <span className="text-xs text-muted-foreground">Chưa ghép</span>
      )}
    </div>
  );
}

interface AxisMappingDialogProps {
  attribute: Attribute | null;
  canEdit: boolean;
  onClose: () => void;
}

/**
 * Ghép thuộc tính phân loại của công ty sang sales attribute của từng sàn (Documents/21 §18.8.3 nguồn 2). Thuộc tính có
 * loại chuẩn (màu, cỡ…) đã có mặc định của sàn; chỉ thuộc tính tự đặt mới cần ghép tay.
 */
export function AxisMappingDialog({ attribute, canEdit, onClose }: AxisMappingDialogProps) {
  const [platform, setPlatform] = useState<string>(PLATFORM_TABS[0].platform);
  return (
    <Dialog open={Boolean(attribute)} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Ghép {attribute?.name} sang phân loại của sàn</DialogTitle>
          <DialogDescription>
            Khi đẩy, giá trị của {attribute?.name} gửi vào phân loại đã ghép. Category không có mã nào trong danh sách thì
            tab sàn báo thiếu.
          </DialogDescription>
        </DialogHeader>
        {attribute && (
          <Tabs value={platform} onValueChange={setPlatform}>
            <TabsList>
              {PLATFORM_TABS.map((t) => (
                <TabsTrigger key={t.platform} value={t.platform}>
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
            {PLATFORM_TABS.map((t) => (
              <TabsContent key={t.platform} value={t.platform}>
                <PlatformAxis attribute={attribute} platform={t.platform} platformName={t.label} canEdit={canEdit} onClose={onClose} />
              </TabsContent>
            ))}
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PlatformAxis({
  attribute,
  platform,
  platformName,
  canEdit,
  onClose,
}: {
  attribute: Attribute;
  platform: string;
  platformName: string;
  canEdit: boolean;
  onClose: () => void;
}) {
  const query = useAxisMappings(platform);
  const saveMut = useSaveAxisMapping(platform);
  const row = query.data?.find((m) => m.attributeId === attribute.id);
  const [codes, setCodes] = useState<Code[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCodes([...(row?.codes ?? [])].sort((a, b) => a.priority - b.priority));
    setError(null);
  }, [row]);

  const move = (i: number, to: number) =>
    setCodes((prev) => {
      const next = [...prev];
      const [c] = next.splice(i, 1);
      next.splice(to, 0, c);
      return next;
    });

  const save = async () => {
    setError(null);
    try {
      await saveMut.mutateAsync({ attributeId: attribute.id, codes: codes.map((c) => ({ attributeCode: c.attributeCode })) });
      toast.success(`Đã lưu ghép ${attribute.name} sang ${platformName}`);
      onClose();
    } catch (e) {
      const errs = getProblem(e)?.errors ?? {};
      setError(Object.values(errs)[0] ?? problemMessage(e));
    }
  };

  if (query.isLoading) return <Skeleton className="mt-3 h-24 w-full" />;
  if (query.isError) return <AlertMessage severity="error" className="mt-3">{problemMessage(query.error)}</AlertMessage>;
  if (query.data === null)
    return (
      <div className="mt-3 grid gap-4">
        <AlertMessage severity="info">
          Máy chủ chưa hỗ trợ ghép phân loại sang {platformName}. Mở lại sau khi bản cập nhật lên.
        </AlertMessage>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Đóng
          </Button>
        </DialogFooter>
      </div>
    );

  return (
    <div className="mt-3 grid gap-4">
      {error && <AlertMessage severity="warning">{error}</AlertMessage>}
      {row?.defaultCodes.length ? (
        <p className="text-sm text-muted-foreground">
          Mặc định của {platformName}: <span className="font-mono">{row.defaultCodes.join(', ')}</span>. Mã ghép tay dưới đây
          được thử trước mặc định.
        </p>
      ) : null}
      {codes.length === 0 && !row?.defaultCodes.length && (
        <p className="text-sm text-muted-foreground">Chưa ghép sang {platformName}.</p>
      )}
      <ol className="grid gap-2">
        {codes.map((c, i) => (
          <li key={c.attributeCode} className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-1.5">
            <Badge variant="outline">{i + 1}</Badge>
            <span className="font-medium">{c.attributeLabel}</span>
            <span className="font-mono text-xs text-muted-foreground">{c.attributeCode}</span>
            {canEdit && (
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
          </li>
        ))}
      </ol>
      {canEdit && (
        <AttributeCodePicker
          platform={platform}
          platformName={platformName}
          kind="sales"
          exclude={codes.map((c) => c.attributeCode)}
          onPick={(a) => setCodes((prev) => [...prev, { attributeCode: a.code, attributeLabel: a.label }])}
        />
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={saveMut.isPending}>
          {canEdit ? 'Huỷ' : 'Đóng'}
        </Button>
        {canEdit && (
          <Button type="button" onClick={save} disabled={saveMut.isPending}>
            {saveMut.isPending ? 'Đang lưu...' : `Lưu ghép ${platformName}`}
          </Button>
        )}
      </DialogFooter>
    </div>
  );
}
