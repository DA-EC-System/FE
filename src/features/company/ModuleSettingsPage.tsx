import { useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/common/PageHeader';
import { AlertMessage } from '@/components/common/AlertMessage';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardAction } from '@/components/ui/card';
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
import { Skeleton } from '@/components/ui/skeleton';
import { useCompanyModules, useSetModule } from '@/api/companySettings.api';
import { getErrorMessage, getProblem } from '@/api/client';
import { problemCode, problemMessage } from '@/api/problemMessages';
import { formatDateTime } from '@/utils/format';
import { MODULE_LABELS, type OptionalModuleKey } from '@/utils/modules';
import type { CompanyModule } from '@/types/companySettings';

const MODULE_DESCRIPTIONS: Record<OptionalModuleKey, string> = {
  purchasing: 'Nhà cung cấp, đơn mua hàng và nhập hàng theo đơn mua.',
  channel: 'Kết nối gian hàng Shopee, TikTok Shop, Lazada; đồng bộ đơn và tồn kho.',
  inbox: 'Gom tin nhắn khách hàng từ các kênh vào một hộp thư.',
  assistant: 'Hỏi đáp về số liệu bán hàng bằng tiếng Việt, chạy trên OpenAI.',
  report: 'Báo cáo doanh thu, lợi nhuận, tồn kho theo thời gian.',
};

const HAS_DATA_NOTE = 'Công ty đã có dữ liệu trong phân hệ này nên không tắt được.';

/** UC-PI-02: CEO bật/tắt năm phân hệ tuỳ chọn; có hiệu lực ngay với mọi nhân viên */
export function ModuleSettingsPage() {
  const modulesQuery = useCompanyModules();
  const setModule = useSetModule();

  const [disabling, setDisabling] = useState<CompanyModule | null>(null);
  const [consentOpen, setConsentOpen] = useState(false);
  const [consentChecked, setConsentChecked] = useState(false);

  const submit = async (code: OptionalModuleKey, enabled: boolean, aiConsent?: boolean) => {
    const label = MODULE_LABELS[code];
    try {
      await setModule.mutateAsync({ code, enabled, aiConsent });
      toast.success(`Đã ${enabled ? 'bật' : 'tắt'} ${label}`);
    } catch (err) {
      // Phiên khác vừa đổi: báo trạng thái hiện tại, danh sách đã đồng bộ theo current (M2)
      const code409 = problemCode(err);
      const current = (getProblem(err) as { current?: CompanyModule } | undefined)?.current;
      if (code409 === 'module_state_changed' && current) {
        toast.warning(
          `${label} vừa được người khác ${current.enabled ? 'bật' : 'tắt'}, hiện đang ${
            current.enabled ? 'bật' : 'tắt'
          }. Chưa có gì thay đổi.`,
        );
      } else {
        toast[getProblem(err)?.status === 409 ? 'warning' : 'error'](problemMessage(err));
      }
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
    <div>
      <PageHeader
        title="Phân hệ"
        subtitle="Bật hoặc tắt các phân hệ tuỳ chọn. Thay đổi có hiệu lực ngay với mọi nhân viên của công ty."
      />

      {modulesQuery.isError && (
        <AlertMessage severity="error" className="mb-4">
          {getErrorMessage(modulesQuery.error)}
        </AlertMessage>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {modulesQuery.isLoading &&
          Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-48 rounded-xl" />)}
        {modulesQuery.data?.map((m) => (
          <Card key={m.code} className="gap-3" data-module={m.code}>
            <CardHeader>
              <CardTitle className="text-base">{MODULE_LABELS[m.code]}</CardTitle>
              <CardAction>
                <Badge variant={m.enabled ? 'success' : 'secondary'}>
                  {m.enabled ? 'Đang bật' : 'Đang tắt'}
                </Badge>
              </CardAction>
            </CardHeader>
            <CardContent className="flex-1 space-y-2 text-sm">
              <p className="text-muted-foreground">{MODULE_DESCRIPTIONS[m.code]}</p>
              {m.enabled && m.enabledAt && (
                <p className="text-xs text-muted-foreground">
                  Bật lúc {formatDateTime(m.enabledAt)}
                  {m.enabledBy ? ` bởi ${m.enabledBy.fullName}` : ''}
                </p>
              )}
              {m.code === 'assistant' && m.enabled && m.aiConsentAt && (
                <p className="text-xs text-muted-foreground">
                  Đã đồng ý gửi dữ liệu tới OpenAI lúc {formatDateTime(m.aiConsentAt)}
                  {m.aiConsentBy ? ` (${m.aiConsentBy.fullName})` : ''}
                </p>
              )}
            </CardContent>
            <CardFooter className="flex-col items-start gap-2">
              {m.enabled ? (
                <>
                  <Button
                    variant="outline"
                    className="text-destructive hover:text-destructive"
                    disabled={m.hasData || Boolean(busyCode)}
                    onClick={() => setDisabling(m)}
                  >
                    {busyCode === m.code ? 'Đang tắt...' : 'Tắt'}
                  </Button>
                  {m.hasData && (
                    <p className="text-xs text-muted-foreground" data-testid="has-data-note">
                      {HAS_DATA_NOTE}
                    </p>
                  )}
                </>
              ) : (
                <Button disabled={Boolean(busyCode)} onClick={() => handleEnable(m)}>
                  {busyCode === m.code ? 'Đang bật...' : 'Bật'}
                </Button>
              )}
            </CardFooter>
          </Card>
        ))}
      </div>

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
      <Dialog
        open={consentOpen}
        onOpenChange={(next) => !next && !setModule.isPending && setConsentOpen(false)}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Bật Trợ lý AI</DialogTitle>
            <DialogDescription>
              Trợ lý AI chạy trên dịch vụ của OpenAI. Khi nhân viên đặt câu hỏi, hệ thống sẽ gửi câu
              hỏi cùng dữ liệu liên quan của công ty (sản phẩm, đơn hàng, tồn kho, doanh thu) tới
              OpenAI để trả lời.
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Mật khẩu, khoá kết nối gian hàng và thông tin thanh toán không được gửi đi.
          </p>
          <div className="flex items-start gap-3">
            <Checkbox
              id="ai-consent"
              className="mt-0.5"
              checked={consentChecked}
              onCheckedChange={(v) => setConsentChecked(v === true)}
            />
            <Label htmlFor="ai-consent" className="leading-snug font-normal">
              Tôi đồng ý gửi dữ liệu của công ty tới OpenAI khi dùng Trợ lý AI
            </Label>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConsentOpen(false)}
              disabled={setModule.isPending}
            >
              Không đồng ý
            </Button>
            <Button
              disabled={!consentChecked || setModule.isPending}
              onClick={() => void submit('assistant', true, true)}
            >
              {setModule.isPending ? 'Đang bật...' : 'Đồng ý và bật'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
