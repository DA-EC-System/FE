import { Toaster as Sonner, type ToasterProps } from 'sonner';
import { useColorMode } from '@/theme/ColorModeContext';

export function Toaster({ ...props }: ToasterProps) {
  const { mode } = useColorMode();

  return (
    <Sonner
      theme={mode}
      className="toaster group [&_div[data-content]]:w-full"
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
        } as React.CSSProperties
      }
      {...props}
    />
  );
}
