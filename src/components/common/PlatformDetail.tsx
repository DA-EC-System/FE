import { ChevronDown } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

/** Câu gốc của sàn, thu gọn dưới câu tiếng Việt (FE#250, Documents/21 §18.4) */
export function PlatformDetail({ text, className }: { text?: string | null; className?: string }) {
  if (!text) return null;
  return (
    <Collapsible className={cn('grid justify-items-start gap-1 text-xs', className)} data-testid="platform-detail">
      <CollapsibleTrigger
        // Nằm trong dòng bảng bấm được: không mở dòng khi bấm xem chi tiết
        onClick={(e) => e.stopPropagation()}
        className="group inline-flex items-center gap-1 text-muted-foreground underline-offset-2 hover:underline"
      >
        Chi tiết từ sàn
        <ChevronDown className="size-3.5 transition-transform group-data-[state=open]:rotate-180" aria-hidden />
      </CollapsibleTrigger>
      <CollapsibleContent className="font-mono break-words text-start text-muted-foreground">{text}</CollapsibleContent>
    </Collapsible>
  );
}
