import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Sparkles } from 'lucide-react';
import { AlertMessage } from '@/components/common/AlertMessage';
import { SearchInput } from '@/components/common/FilterBar';
import { Badge } from '@/components/ui/badge';
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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { cn } from '@/lib/utils';

export interface MatchOption {
  id: string;
  title: string;
  subtitle: string;
  /** SKU người bán trên sàn trùng SKU biến thể: đưa lên đầu */
  suggested: boolean;
}

interface MatchDialogProps {
  open: boolean;
  title: string;
  description: ReactNode;
  /** Nhãn ô tìm, vd "Tìm SKU sàn..." */
  searchLabel: string;
  options: MatchOption[];
  /** Lựa chọn hiện tại (đổi ghép) */
  initialId?: string | null;
  empty: string;
  saving: boolean;
  /** Lỗi BE trả về, hiện trong hộp và giữ hộp mở (vd sku_taken) */
  error: string | null;
  onSave: (id: string) => void;
  onClose: () => void;
}

/** UC-CH-02 bước 4–5: chọn một mục ở phía bên kia để ghép (SKU sàn cho biến thể, hoặc ngược lại) */
export function MatchDialog({
  open,
  title,
  description,
  searchLabel,
  options,
  initialId,
  empty,
  saving,
  error,
  onSave,
  onClose,
}: MatchDialogProps) {
  const [search, setSearch] = useState('');
  /** Người dùng đã chọn; chưa chọn thì lấy ghép hiện tại hoặc mục gợi ý */
  const [picked, setPicked] = useState<string | null>(null);
  const selected = picked ?? initialId ?? options.find((o) => o.suggested)?.id ?? '';

  useEffect(() => {
    if (open) return;
    setSearch('');
    setPicked(null);
  }, [open]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return options
      .filter((o) => !q || o.title.toLowerCase().includes(q) || o.subtitle.toLowerCase().includes(q))
      .sort((a, b) => Number(b.suggested) - Number(a.suggested));
  }, [options, search]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !saving && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <SearchInput value={search} onChange={setSearch} placeholder={searchLabel} className="md:w-full" />
        {error && <AlertMessage severity="error">{error}</AlertMessage>}
        <div className="max-h-80 overflow-y-auto rounded-md border">
          {shown.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">{empty}</p>
          ) : (
            <RadioGroup value={selected} onValueChange={setPicked} className="gap-0" aria-label={title}>
              {shown.map((o) => (
                <Label
                  key={o.id}
                  htmlFor={`match-${o.id}`}
                  className={cn(
                    'flex cursor-pointer items-center gap-3 border-b p-3 font-normal last:border-b-0 hover:bg-muted/50',
                    selected === o.id && 'bg-primary/5',
                  )}
                >
                  <RadioGroupItem id={`match-${o.id}`} value={o.id} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{o.title}</span>
                    <span className="block truncate font-mono text-xs text-muted-foreground">{o.subtitle}</span>
                  </span>
                  {o.suggested && (
                    <Badge variant="info">
                      <Sparkles />
                      Gợi ý
                    </Badge>
                  )}
                </Label>
              ))}
            </RadioGroup>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={saving} onClick={onClose}>
            Huỷ
          </Button>
          <Button disabled={!selected || saving || selected === initialId} onClick={() => onSave(selected)}>
            {saving ? 'Đang lưu...' : 'Lưu ghép'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
