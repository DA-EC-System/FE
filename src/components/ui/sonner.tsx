import { Toaster as Sonner, type ToasterProps } from 'sonner';
import { useColorMode } from '@/theme/ColorModeContext';

/** Thời gian một thông báo hiện; vạch thời gian ở đáy thông báo chạy cùng nhịp (styles/index.css) */
const TOAST_DURATION = 4000;

/**
 * Thông báo theo .toast của Test_UI, FE#129: giữa phía dưới, nền tối (đảo màu so với trang),
 * icon tô màu theo loại, nút hành động (vd Hoàn tác: `toast('Đã xoá', { action: { label: 'Hoàn tác', onClick } })`)
 * và vạch thời gian. Kiểu màu nằm ở styles/index.css; props truyền vào vẫn ghi đè được mặc định.
 */
export function Toaster({ ...props }: ToasterProps) {
  const { mode } = useColorMode();

  return (
    <Sonner
      theme={mode}
      position="bottom-center"
      duration={TOAST_DURATION}
      gap={8}
      className="toaster group [&_div[data-content]]:w-full"
      style={
        {
          '--normal-bg': 'var(--foreground)',
          '--normal-text': 'var(--card)',
          '--normal-border': 'transparent',
          '--border-radius': 'var(--radius-card)',
          '--toast-duration': `${TOAST_DURATION}ms`,
        } as React.CSSProperties
      }
      {...props}
    />
  );
}
