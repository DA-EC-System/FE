import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Skeleton,
  Snackbar,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import { PageHeader } from '@/components/common/PageHeader';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { useCompanyModules, useSetModule } from '@/api/companySettings.api';
import { getErrorMessage, getProblem } from '@/api/client';
import { formatDateTime } from '@/utils/format';
import { MODULE_LABELS, type OptionalModuleKey } from '@/utils/modules';
import type { CompanyModule } from '@/types/companySettings';

type Toast = { severity: 'success' | 'error' | 'warning'; msg: string };

const MODULE_DESCRIPTIONS: Record<OptionalModuleKey, string> = {
  purchasing: 'Nhà cung cấp, đơn mua hàng và nhập hàng theo đơn mua.',
  channel: 'Kết nối gian hàng Shopee, TikTok Shop, Lazada; đồng bộ đơn và tồn kho.',
  inbox: 'Gom tin nhắn khách hàng từ các kênh vào một hộp thư.',
  assistant: 'Hỏi đáp về số liệu bán hàng bằng tiếng Việt, chạy trên OpenAI.',
  report: 'Báo cáo doanh thu, lợi nhuận, tồn kho theo thời gian.',
};

/** UC-PI-02: CEO bật/tắt năm phân hệ tuỳ chọn; có hiệu lực ngay với mọi nhân viên */
export function ModuleSettingsPage() {
  const modulesQuery = useCompanyModules();
  const setModule = useSetModule();

  const [disabling, setDisabling] = useState<CompanyModule | null>(null);
  const [consentOpen, setConsentOpen] = useState(false);
  const [consentChecked, setConsentChecked] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  const submit = async (code: OptionalModuleKey, enabled: boolean, aiConsent?: boolean) => {
    const label = MODULE_LABELS[code];
    try {
      await setModule.mutateAsync({ code, enabled, aiConsent });
      setToast({ severity: 'success', msg: `Đã ${enabled ? 'bật' : 'tắt'} ${label}` });
    } catch (err) {
      // Phiên khác vừa đổi hoặc phân hệ đã có dữ liệu: báo nội dung BE trả về, danh sách tự tải lại
      const conflict = getProblem(err)?.status === 409;
      setToast({ severity: conflict ? 'warning' : 'error', msg: getErrorMessage(err) });
    } finally {
      setDisabling(null);
      setConsentOpen(false);
    }
  };

  const handleEnable = (m: CompanyModule) => {
    if (m.code === 'assistant') {
      setConsentChecked(false);
      setConsentOpen(true);
      return;
    }
    void submit(m.code, true);
  };

  const busyCode = setModule.isPending ? setModule.variables?.code : undefined;

  return (
    <Box>
      <PageHeader
        title="Phân hệ"
        subtitle="Bật hoặc tắt các phân hệ tuỳ chọn. Thay đổi có hiệu lực ngay với mọi nhân viên của công ty."
      />

      {modulesQuery.isError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {getErrorMessage(modulesQuery.error)}
        </Alert>
      )}

      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' },
        }}
      >
        {modulesQuery.isLoading &&
          Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} variant="rounded" height={180} />
          ))}
        {modulesQuery.data?.map((m) => (
          <Card
            key={m.code}
            elevation={0}
            sx={{ height: '100%', display: 'flex', flexDirection: 'column', border: 1, borderColor: 'divider' }}
          >
            <CardContent sx={{ flexGrow: 1 }}>
              <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
                <Typography variant="h6">{MODULE_LABELS[m.code]}</Typography>
                <Chip
                  size="small"
                  color={m.enabled ? 'success' : 'default'}
                  label={m.enabled ? 'Đang bật' : 'Đang tắt'}
                />
              </Stack>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                {MODULE_DESCRIPTIONS[m.code]}
              </Typography>
              {m.enabled && m.enabledAt && (
                <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1.5 }}>
                  Bật lúc {formatDateTime(m.enabledAt)}
                  {m.enabledBy ? ` bởi ${m.enabledBy.fullName}` : ''}
                </Typography>
              )}
              {m.code === 'assistant' && m.enabled && m.aiConsentAt && (
                <Typography variant="caption" color="text.secondary" component="p">
                  Đã đồng ý gửi dữ liệu tới OpenAI lúc {formatDateTime(m.aiConsentAt)}
                  {m.aiConsentBy ? ` (${m.aiConsentBy.fullName})` : ''}
                </Typography>
              )}
            </CardContent>
            <CardActions sx={{ px: 2, pb: 2 }}>
              {m.enabled ? (
                <Tooltip
                  title={m.hasData ? 'Công ty đã có dữ liệu trong phân hệ này nên không tắt được.' : ''}
                >
                  {/* span để Tooltip vẫn hiện khi nút bị khoá */}
                  <span>
                    <Button
                      variant="outlined"
                      color="error"
                      disabled={m.hasData || Boolean(busyCode)}
                      onClick={() => setDisabling(m)}
                    >
                      Tắt
                    </Button>
                  </span>
                </Tooltip>
              ) : (
                <Button
                  variant="contained"
                  disabled={Boolean(busyCode)}
                  onClick={() => handleEnable(m)}
                >
                  {busyCode === m.code ? 'Đang bật...' : 'Bật'}
                </Button>
              )}
            </CardActions>
          </Card>
        ))}
      </Box>

      <ConfirmDialog
        open={Boolean(disabling)}
        title={`Tắt ${disabling ? MODULE_LABELS[disabling.code] : ''}?`}
        message="Nhân viên sẽ không còn thấy các màn hình của phân hệ này. Có thể bật lại bất cứ lúc nào."
        confirmLabel="Tắt"
        destructive
        loading={setModule.isPending}
        onConfirm={() => disabling && void submit(disabling.code, false)}
        onClose={() => setDisabling(null)}
      />

      {/* UC-PI-02 luồng phụ: bật Trợ lý AI cần CEO đồng ý gửi dữ liệu tới OpenAI */}
      <Dialog open={consentOpen} onClose={() => setConsentOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Bật Trợ lý AI</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 1.5 }}>
            Trợ lý AI chạy trên dịch vụ của OpenAI. Khi nhân viên đặt câu hỏi, hệ thống sẽ gửi câu
            hỏi cùng dữ liệu liên quan của công ty (sản phẩm, đơn hàng, tồn kho, doanh thu) tới
            OpenAI để trả lời.
          </Typography>
          <Typography variant="body2" sx={{ mb: 1.5 }}>
            Mật khẩu, khoá kết nối gian hàng và thông tin thanh toán không được gửi đi.
          </Typography>
          <FormControlLabel
            control={
              <Checkbox checked={consentChecked} onChange={(e) => setConsentChecked(e.target.checked)} />
            }
            label="Tôi đồng ý gửi dữ liệu của công ty tới OpenAI khi dùng Trợ lý AI"
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setConsentOpen(false)} color="inherit">
            Không đồng ý
          </Button>
          <Button
            variant="contained"
            disabled={!consentChecked || setModule.isPending}
            onClick={() => void submit('assistant', true, true)}
          >
            Đồng ý và bật
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={Boolean(toast)}
        autoHideDuration={5000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        {toast ? (
          <Alert severity={toast.severity} onClose={() => setToast(null)} variant="filled">
            {toast.msg}
          </Alert>
        ) : undefined}
      </Snackbar>
    </Box>
  );
}
