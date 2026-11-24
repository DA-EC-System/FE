import { useEffect, useState, type ReactNode } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { Check } from 'lucide-react';
import { AlertMessage } from '@/components/common/AlertMessage';
import { HelpTip } from '@/components/common/HelpTip';
import { LifecycleSteps } from '@/components/common/LifecycleSteps';
import { PageHeader } from '@/components/common/PageHeader';
import { PageSpinner } from '@/components/common/PageSpinner';
import type { StatusMeta } from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useShop } from '@/api/shops.api';
import { getProblem } from '@/api/client';
import { problemMessage } from '@/api/problemMessages';
import { useAuth } from '@/hooks/useAuth';
import { useBreadcrumb } from '@/hooks/useBreadcrumb';
import { ROUTES } from '@/router/routes';
import { WelcomeReturnBar } from '@/features/company/WelcomeReturnBar';
import type { DraftStep } from '@/types/setupDraft';
import { platformLabel, returnWindowNote } from './shopSchemas';
import { SETUP_POLL_MAX_MS, SETUP_POLL_MS, setupRunning } from './setupDecisions';
import { CategorySyncBlock } from './setup/CategorySyncBlock';
import { CutoffStep } from './setup/CutoffStep';
import { DraftNotices, DraftSavedLine } from './setup/DraftNotices';
import { GroupsStep } from './setup/GroupsStep';
import { SetupProgress } from './setup/SetupProgress';
import { StockSyncStep } from './setup/StockSyncStep';
import { setupIssues, SETUP_STEP_NAMES, type SetupIssue } from './setup/setupDraft';
import { useFinishSetup } from './setup/useFinishSetup';
import { useGroupStep } from './setup/useGroupStep';
import { useSetupDraft } from './setup/useSetupDraft';

/** Các bước của trang thiết lập gian hàng, cùng thứ tự bước 3–6 của wizard onboarding (FE#468) */
type SetupStep = 'match' | 'groups' | 'opening' | 'cutoff' | 'run';
const PATH: readonly SetupStep[] = ['match', 'groups', 'opening', 'cutoff', 'run'];
const STEP_META: Record<SetupStep, StatusMeta> = {
  match: { label: 'Liên kết SKU sàn', variant: 'outline' },
  groups: { label: 'Danh mục sản phẩm', variant: 'outline' },
  opening: { label: 'Đồng bộ tồn lần đầu', variant: 'outline' },
  cutoff: { label: 'Đồng bộ đơn từ', variant: 'outline' },
  run: { label: 'Chạy nền', variant: 'outline' },
};
/** Bước nào xác nhận mốc nào của nháp khi bấm Tiếp (§18.7.5) */
const CONFIRMS: Partial<Record<SetupStep, DraftStep>> = { match: 'link_skus', groups: 'assign_groups', opening: 'stock_sync' };
const ISSUE_STEP: Record<SetupIssue['step'], SetupStep> = {
  link_skus: 'match',
  assign_groups: 'groups',
  stock_sync: 'opening',
  order_cutoff: 'cutoff',
};

const STEP_HELP: Record<Exclude<SetupStep, 'run'>, string> = {
  match:
    'SKU đã liên kết: Commerio trừ tồn và đồng bộ tồn lên sàn. SKU bỏ qua: vẫn bán trên sàn nhưng Commerio không trừ tồn, liên kết sau ở trang Listing & giá.',
  groups:
    'Mỗi sản phẩm sẽ tạo từ sàn cần một danh mục sản phẩm. Danh mục dùng để quản lý, lọc, gợi ý giá và ngưỡng tồn trong Commerio; không đổi gì trên sàn.',
  opening:
    'Tồn trên sàn lúc kết nối có thể khác số có thể bán ở Commerio. Chọn đồng bộ tồn Commerio lên sàn, hoặc kiểm kho trước rồi mới đồng bộ.',
  cutoff:
    'Đồng bộ đơn từ là thời điểm Commerio bắt đầu lấy đơn của gian hàng. Đơn đặt trước thời điểm này đã xử lý trên sàn nên không đồng bộ về, tránh tạm giữ tồn sai.',
};

/**
 * Thiết lập gian hàng thứ hai trở đi (sơ đồ C1; Documents/21 §18.7.5 "Bản nháp thiết lập"): cùng các bước và cùng bản nháp
 * với wizard onboarding, mọi lựa chọn lưu ở BE nên tải lại trang, đổi máy vẫn còn. Hoàn tất gửi `{ draftVersion }`.
 */
export function ShopSetupPage() {
  const { shopId = '' } = useParams();
  const { companyContext } = useAuth();
  const companyId = companyContext?.companyId ?? '';
  const [done, setDone] = useState(false);
  const [pollFrom, setPollFrom] = useState(0);
  const shop = useShop(shopId, (data) =>
    done && setupRunning(data) && Date.now() - pollFrom < SETUP_POLL_MAX_MS ? SETUP_POLL_MS : false,
  );
  useBreadcrumb(shop.data?.shopName);
  const connecting = shop.data?.status === 'connecting';
  const state = useSetupDraft(shopId, connecting && !done);
  const groupData = useGroupStep(shopId, state, connecting && !done);
  const finish = useFinishSetup(shopId, state);
  const [step, setStep] = useState<SetupStep>('match');
  const [resumed, setResumed] = useState(false);
  const [issues, setIssues] = useState<SetupIssue[]>([]);
  const [focus, setFocus] = useState<{ key: string | null; nonce: number }>({ key: null, nonce: 0 });

  // Mở lại trang: về bước đầu tiên chưa xác nhận
  const draft = state.draft;
  useEffect(() => {
    if (resumed || !state.view.data) return;
    setResumed(true);
    const c = draft?.confirmed;
    setStep(!c?.link_skus ? 'match' : !c.assign_groups ? 'groups' : !c.stock_sync ? 'opening' : 'cutoff');
  }, [resumed, state.view.data, draft]);

  if (shop.isLoading) return <PageSpinner />;
  if (shop.data && !connecting && !done && !finish.pending) return <Navigate to={ROUTES.company.shop(companyId, shopId)} replace />;
  if (shop.isError || !shop.data) return <AlertMessage severity="error">{problemMessage(shop.error)}</AlertMessage>;

  const s = shop.data;
  const platformName = platformLabel(s.platform, s.platformName);
  const needDays = s.capabilities.returnWindow === 'days';
  const firstShop = state.view.data?.firstShopOfCompany === true;
  const current: SetupStep = done ? 'run' : step;
  const idx = PATH.indexOf(current);

  const goTo = (it: SetupIssue) => {
    setStep(ISSUE_STEP[it.step]);
    if (it.rowKey) setFocus((f) => ({ key: it.rowKey, nonce: f.nonce + 1 }));
  };

  const next = async () => {
    const confirm = CONFIRMS[step];
    setIssues([]);
    if (confirm) {
      const out = await state.confirm(confirm);
      if (!out.ok) {
        if (out.invalid) setIssues(setupIssues(getProblem(out.error), state.draft));
        return;
      }
    }
    setStep(PATH[idx + 1]);
  };

  const finishNow = async () => {
    const res = await finish.run();
    if (res) {
      setPollFrom(Date.now());
      setDone(true);
    }
  };

  // Lý do Tiếp bị khoá, kèm chỗ sửa (CLAUDE.md "Lỗi phải chỉ chỗ sửa")
  const why: ReactNode =
    step === 'match' ? (
      'Danh sách Liên kết SKU sàn đang làm ở FE#460 (anh Khoa). Xong mới bấm Tiếp được.'
    ) : step === 'groups' && groupData.missing > 0 ? (
      <>
        Còn {groupData.missing} sản phẩm chưa có danh mục.{' '}
        <Button
          variant="link"
          size="sm"
          className="h-auto p-0"
          onClick={() => setFocus((f) => ({ key: groupData.firstMissing, nonce: f.nonce + 1 }))}
        >
          Tới dòng đầu tiên
        </Button>
      </>
    ) : step === 'opening' && !draft?.openingStock ? (
      'Chọn cách đồng bộ tồn lần đầu.'
    ) : step === 'opening' && needDays && draft?.returnWindowDays == null ? (
      'Nhập hạn trả hàng.'
    ) : null;
  const blocked = Boolean(why) || state.saving || state.conflict || state.needsReauth;

  return (
    <div className="mx-auto grid max-w-4xl gap-4">
      <WelcomeReturnBar stepKey="setup_shop" finished={done} />
      <PageHeader
        title={`Thiết lập ${s.shopName}`}
        subtitle={`${platformName} · làm một lần sau khi kết nối; xong mới đồng bộ đơn và tồn`}
        help="Commerio chưa đồng bộ đơn và tồn của gian hàng cho đến khi xong các bước. Lựa chọn lưu nháp ở Commerio; bỏ dở thì quay lại bằng nút Thiết lập ở danh sách gian hàng."
      />
      <Card>
        <CardContent>
          <LifecycleSteps path={PATH} current={current} statuses={STEP_META} />
        </CardContent>
      </Card>
      <DraftNotices state={state} />
      {state.view.isError && !done && <AlertMessage severity="error">{problemMessage(state.view.error)}</AlertMessage>}
      {issues.length > 0 && (
        <AlertMessage severity="error">
          <ul className="grid list-disc gap-1 ps-5">
            {issues.map((it, i) => (
              <li key={i}>
                {SETUP_STEP_NAMES[it.step]}: {it.message}{' '}
                {it.rowKey && (
                  <Button size="sm" variant="link" className="h-auto p-0" onClick={() => goTo(it)}>
                    Tới dòng này
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </AlertMessage>
      )}

      {done ? (
        <Card>
          <StepHeader title="Chạy nền" help="Commerio chạy nền các việc còn lại. Trang tự cập nhật; đóng trang thì việc vẫn chạy." />
          <CardContent>
            <SetupProgress shop={s} companyId={companyId} timedOut={Date.now() - pollFrom >= SETUP_POLL_MAX_MS} />
          </CardContent>
          <CardFooter className="justify-end border-t pt-4">
            <Button asChild>
              <Link to={ROUTES.company.shop(companyId, s.id)}>Xem listing của gian hàng</Link>
            </Button>
          </CardFooter>
        </Card>
      ) : (
        <Card>
          <StepHeader title={STEP_META[step].label} help={STEP_HELP[step as Exclude<SetupStep, 'run'>]} />
          <CardContent className="grid gap-4">
            {!state.view.data ? (
              <PageSpinner />
            ) : step === 'match' ? (
              <>
                {/* Thành duyệt 24/11/2026: giữ chỗ tới khi danh sách Liên kết SKU của FE#460 có chế độ nháp */}
                <AlertMessage severity="info">
                  Bước này dùng danh sách Liên kết SKU sàn chung với trang Listing & giá (FE#460). Danh sách chưa có chế độ nháp nên chưa
                  chọn được ở đây.
                </AlertMessage>
                <CategorySyncBlock shopId={s.id} platform={s.platform} platformName={platformName} />
              </>
            ) : step === 'groups' ? (
              <>
                <GroupsStep data={groupData} state={state} focusProductId={focus.key} focusNonce={focus.nonce} />
                <CategorySyncBlock shopId={s.id} platform={s.platform} platformName={platformName} />
              </>
            ) : step === 'opening' ? (
              <StockSyncStep shopId={s.id} state={state} firstShop={firstShop} needDays={needDays} />
            ) : (
              <CutoffStep
                state={state}
                finish={finish}
                proposedCutoffAt={state.view.data.proposedCutoffAt}
                returnNote={returnWindowNote(s.capabilities, platformName)}
                onGoTo={goTo}
              />
            )}
            <DraftSavedLine state={state} />
          </CardContent>
          <CardFooter className="flex-wrap justify-between gap-3 border-t pt-4">
            <Button variant="outline" disabled={idx === 0 || finish.pending} onClick={() => setStep(PATH[idx - 1])}>
              Quay lại
            </Button>
            {why && <span className="min-w-0 flex-1 text-sm text-muted-foreground">{why}</span>}
            {step === 'cutoff' ? (
              <Button disabled={finish.pending || state.saving || state.conflict} onClick={() => void finishNow()}>
                <Check />
                {finish.pending ? 'Đang hoàn tất...' : 'Hoàn tất thiết lập gian hàng'}
              </Button>
            ) : (
              <Button disabled={blocked} onClick={() => void next()}>
                Tiếp
              </Button>
            )}
          </CardFooter>
        </Card>
      )}
    </div>
  );
}

/** Đầu ô của một bước: tiêu đề kèm HelpTip (FE#131) */
function StepHeader({ title, help }: { title: string; help: string }) {
  return (
    <CardHeader className="border-b">
      <CardTitle className="flex items-center gap-1.5">
        {title}
        <HelpTip content={help} topic={title} />
      </CardTitle>
    </CardHeader>
  );
}
