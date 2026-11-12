import { useState } from 'react';
import { toast } from 'sonner';
import { ChartLine, Check, MessagesSquare, Sparkles, Store, Truck, type LucideIcon } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { AlertMessage } from '@/components/common/AlertMessage';
import { BlockedReason } from '@/components/common/BlockedReason';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { HelpTip } from '@/components/common/HelpTip';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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
import { Switch } from '@/components/ui/switch';
import { useCompanyModules, useSetModule } from '@/api/companySettings.api';
import { getErrorMessage, getProblem } from '@/api/client';
import { problemCode, problemMessage } from '@/api/problemMessages';
import { usePageGuide } from '@/guides/usePageGuide';
import { formatDateTime } from '@/utils/format';
import { CORE_MODULES, MODULE_LABELS, type OptionalModuleKey } from '@/utils/modules';
import type { CompanyModule } from '@/types/companySettings';

const MODULE_DESCRIPTIONS: Record<OptionalModuleKey, string> = {
  purchasing: 'Nhà cung cấp, đơn mua hàng và nhập hàng theo đơn mua.',
  channel: 'Kết nối gian hàng Shopee, TikTok Shop, Lazada; đồng bộ đơn và tồn kho.',
  inbox: 'Gom tin nhắn khách hàng từ các kênh vào một hộp thư.',
  assistant: 'Hỏi đáp về số liệu bán hàng bằng tiếng Việt, chạy trên OpenAI.',
  report: 'Báo cáo doanh thu, lợi nhuận, tồn kho theo thời gian.',
};

/** Chi tiết trong HelpTip của từng dòng; dòng chỉ giữ một câu mô tả */
const MODULE_HELP: Record<OptionalModuleKey, string> = {
  purchasing:
    'Thêm mục Mua hàng trên thanh bên: nhà cung cấp, đề nghị mua, đơn mua, phiếu nhập theo đơn mua và trả hàng nhà cung cấp.',
  channel:
    'Thêm mục Kênh bán: kết nối gian hàng, ghép SKU, kéo đơn sàn về và đẩy tồn, giá lên sàn.',
  inbox: 'Tin nhắn khách gửi qua các kênh về một hộp thư, nhân viên trả lời ở một chỗ.',
  assistant:
    'Câu hỏi cùng dữ liệu liên quan của công ty được gửi tới OpenAI, nên khi bật CEO phải đồng ý gửi dữ liệu. Mật khẩu, khoá kết nối gian hàng và thông tin thanh toán không được gửi đi.',
  report: 'Thêm mục Báo cáo kinh doanh: doanh thu, lợi nhuận, tồn kho theo khoảng thời gian chọn.',
};

const MODULE_ICONS: Record<OptionalModuleKey, LucideIcon> = {
  purchasing: Truck,
  channel: Store,
  inbox: MessagesSquare,
  assistant: Sparkles,
  report: ChartLine,
};

const HAS_DATA_NOTE = 'Công ty đã có dữ liệu trong phân hệ này nên không tắt được.';

const PAGE_HELP =
  'Tắt một phân hệ thì nhân viên không còn thấy các màn hình của phân hệ đó, bật lại lúc nào cũng được. Phân hệ đã có dữ liệu thì không tắt được. Phân hệ cốt lõi luôn bật.';

/** UC-PI-02: CEO bật/tắt năm phân hệ tuỳ chọn; có hiệu lực ngay với mọi nhân viên */
export function ModuleSettingsPage() {
  const modulesQuery = useCompanyModules();
  const setModule = useSetModule();
  const { startTour } = usePageGuide('modules', { ready: modulesQuery.isSuccess });

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
        help={PAGE_HELP}
        onTour={startTour}
      />

      {modulesQuery.isError && (
        <AlertMessage severity="error" className="mb-4">
          {getErrorMessage(modulesQuery.error)}
        </AlertMessage>
      )}

      <Card className="gap-0 py-0" data-guide="modules-optional">
        <div className="flex items-center gap-2 border-b px-4 py-3 text-sm font-semibold">
          Phân hệ tuỳ chọn
          {modulesQuery.data && (
            <span className="ms-auto text-[13px] font-normal text-muted-foreground">
              {modulesQuery.data?.filter((m) => m.enabled).length ?? 0}/{modulesQuery.data.length} đang bật
            </span>
          )}
        </div>
        {modulesQuery.isLoading &&
          Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="border-b px-4 py-3 last:border-b-0">
              <Skeleton className="h-12" />
            </div>
          ))}
        {modulesQuery.data?.map((m) => {
          const Icon = MODULE_ICONS[m.code];
          const label = MODULE_LABELS[m.code];
          const locked = m.enabled && m.hasData;
          const toggle = (
            <Switch
              aria-label={label}
              checked={m.enabled}
              disabled={locked || Boolean(busyCode)}
              onCheckedChange={(on) => (on ? handleEnable(m) : setDisabling(m))}
            />
          );
          return (
            <div
              key={m.code}
              data-module={m.code}
              className="flex items-start gap-3 border-b px-4 py-3 last:border-b-0"
            >
              <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                <Icon className="size-4" />
              </span>
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{label}</span>
                  <HelpTip content={MODULE_HELP[m.code]} topic={label} />
                  <Badge variant={m.enabled ? 'success' : 'secondary'}>
                    {busyCode === m.code ? (m.enabled ? 'Đang tắt...' : 'Đang bật...') : m.enabled ? 'Đang bật' : 'Đang tắt'}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">{MODULE_DESCRIPTIONS[m.code]}</p>
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
              </div>
              <div className="pt-1.5">
                {locked ? (
                  <BlockedReason reason={HAS_DATA_NOTE}>
                    <span tabIndex={0} className="inline-flex rounded-full">
                      {toggle}
                    </span>
                  </BlockedReason>
                ) : (
                  toggle
                )}
              </div>
            </div>
          );
        })}
      </Card>

      <Card className="mt-4 gap-0 py-0" data-guide="modules-core">
        <div className="flex items-center gap-2 border-b px-4 py-3 text-sm font-semibold">
          Phân hệ cốt lõi
          <span className="ms-auto text-[13px] font-normal text-muted-foreground">luôn bật, không tắt được</span>
        </div>
        <div className="flex flex-wrap gap-2 p-4" data-testid="core-modules">
          {CORE_MODULES.map((c) => (
            <Badge key={c} variant="outline">
              <Check />
              {MODULE_LABELS[c]}
            </Badge>
          ))}
        </div>
      </Card>

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
