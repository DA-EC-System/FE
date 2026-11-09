import { useId, useState } from 'react';
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
import { Label } from '@/components/ui/label';
import type { PageGuide } from '@/guides/types';

interface PageGuideDialogProps {
  guide: PageGuide;
  /** Màn hình hẹp: không chạy tour, liệt kê luôn các bước trong pop-up */
  compact: boolean;
  /** `dontShow`: người dùng tích "Không hiện lại" */
  onClose: (dontShow: boolean) => void;
  onTour: (dontShow: boolean) => void;
  onPrimary: (dontShow: boolean) => void;
}

/** Pop-up giới thiệu trang lần đầu vào: tiêu đề, 2–4 ý, nút xem từng bước / để sau, ô không hiện lại */
export function PageGuideDialog({ guide, compact, onClose, onTour, onPrimary }: PageGuideDialogProps) {
  const [dontShow, setDontShow] = useState(false);
  const checkId = useId();

  return (
    <Dialog open onOpenChange={(o) => !o && onClose(dontShow)}>
      <DialogContent data-testid="page-guide" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{guide.title}</DialogTitle>
          <DialogDescription className="sr-only">Giới thiệu nhanh trang này</DialogDescription>
        </DialogHeader>
        <ul className="grid list-disc gap-1.5 ps-5 text-sm leading-relaxed text-foreground-2">
          {guide.intro.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        {compact && guide.steps.length > 0 && (
          <ol className="grid gap-2 rounded-lg bg-fill p-3 text-sm">
            {guide.steps.map((s) => (
              <li key={s.target}>
                <span className="font-medium">{s.title}.</span>{' '}
                <span className="text-foreground-2">{s.body}</span>
              </li>
            ))}
          </ol>
        )}
        <div className="flex items-center gap-2">
          <Checkbox id={checkId} checked={dontShow} onCheckedChange={(v) => setDontShow(v === true)} />
          <Label htmlFor={checkId} className="text-sm font-normal">
            Không hiện lại
          </Label>
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" onClick={() => onClose(dontShow)}>
            Để sau
          </Button>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            {guide.primaryAction && (
              <Button variant="outline" onClick={() => onPrimary(dontShow)}>
                {guide.primaryAction.label}
              </Button>
            )}
            {!compact && guide.steps.length > 0 && <Button onClick={() => onTour(dontShow)}>Xem từng bước</Button>}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
