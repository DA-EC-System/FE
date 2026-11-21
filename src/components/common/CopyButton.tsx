import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

interface CopyButtonProps {
  value: string;
  /** Nhãn cho trình đọc màn hình, vd "Sao chép số tài khoản" */
  label: string;
  /** Có chữ thì hiện nút có chữ, không thì nút chữ “Sao chép” */
  text?: string;
}

/** Nút sao chép vào bộ nhớ tạm, báo "Đã sao chép" */
export function CopyButton({ value, label, text }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success('Đã sao chép');
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Không sao chép được. Hãy chọn và sao chép thủ công.');
    }
  };
  return text ? (
    <Button type="button" variant="outline" size="sm" onClick={copy} aria-label={label}>
      {copied ? 'Đã chép' : text}
    </Button>
  ) : (
    <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={copy} aria-label={label}>
      {copied ? 'Đã chép' : 'Sao chép'}
    </Button>
  );
}
