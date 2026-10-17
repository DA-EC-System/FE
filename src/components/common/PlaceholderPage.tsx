import { Construction } from 'lucide-react';

interface PlaceholderPageProps {
  title: string;
  phase?: string;
  description?: string;
}

export function PlaceholderPage({
  title,
  phase = 'Sắp ra mắt',
  description = 'Module này đang được phát triển trong giai đoạn tiếp theo.',
}: PlaceholderPageProps) {
  return (
    <div className="flex justify-center py-16">
      <div className="flex max-w-md flex-col items-center gap-1 rounded-xl border border-dashed bg-card p-10 text-center">
        <Construction className="mb-3 size-12 text-primary" />
        <h2 className="text-lg font-bold">{title}</h2>
        <p className="text-sm text-muted-foreground">{phase}</p>
        <p className="text-xs text-muted-foreground/80">{description}</p>
      </div>
    </div>
  );
}
