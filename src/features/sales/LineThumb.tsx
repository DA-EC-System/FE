import { ImageIcon } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

/** Ảnh nhỏ của dòng đơn; không có ảnh thì hiện biểu tượng */
export function LineThumb({ src, alt, className }: { src?: string | null; alt: string; className?: string }) {
  return (
    <Avatar className={cn('size-10 shrink-0 rounded-md', className)}>
      {src && <AvatarImage src={src} alt={alt} className="object-cover" />}
      <AvatarFallback className="rounded-md">
        <ImageIcon className="size-4 text-muted-foreground" />
      </AvatarFallback>
    </Avatar>
  );
}
