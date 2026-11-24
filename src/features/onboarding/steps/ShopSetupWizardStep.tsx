import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check } from 'lucide-react';
import { AlertMessage } from '@/components/common/AlertMessage';
import { PageSpinner } from '@/components/common/PageSpinner';
import { Button } from '@/components/ui/button';
import { useShop } from '@/api/shops.api';
import { getProblem } from '@/api/client';
import { problemMessage } from '@/api/problemMessages';
import { platformLabel, returnWindowNote } from '@/features/channel/shopSchemas';
import { useStartConnect } from '@/features/channel/useStartConnect';
import { CategorySyncBlock } from '@/features/channel/setup/CategorySyncBlock';
import { CutoffStep } from '@/features/channel/setup/CutoffStep';
import { DraftNotices, DraftSavedLine } from '@/features/channel/setup/DraftNotices';
import { GroupsStep } from '@/features/channel/setup/GroupsStep';
import { StockSyncStep } from '@/features/channel/setup/StockSyncStep';
import { setupIssues, SETUP_STEP_NAMES, type SetupIssue } from '@/features/channel/setup/setupDraft';
import { useFinishSetup } from '@/features/channel/setup/useFinishSetup';
import { useGroupStep } from '@/features/channel/setup/useGroupStep';
import { useSetupDraft } from '@/features/channel/setup/useSetupDraft';
import { SkuLinkList } from '@/features/channel/skuLink/SkuLinkList';
import type { DraftStep } from '@/types/setupDraft';
import type { WizardKey } from '../wizardState';

/** Bước nào xác nhận mốc nào của nháp khi bấm Tiếp (Documents/21 §18.7.5) */
const CONFIRMS: Partial<Record<WizardKey, DraftStep>> = { link_skus: 'link_skus', assign_groups: 'assign_groups', stock_sync: 'stock_sync' };

export type ShopSetupKey = 'link_skus' | 'assign_groups' | 'stock_sync' | 'order_cutoff';

/**
 * Bước 3 tới 6 của wizard (FE#468 PR B nhúng): cùng thân bước, cùng bản nháp với trang `/channel/shops/:id/setup`, nhưng
 * nút Tiếp và Hoàn tất nằm ở chân wizard (`slot`) và xong bước thì đọc lại tiến độ rồi sang bước kế (`onAdvance`).
 * `onOwnsAction` báo cho wizard biết khi nút ở chân là của bước này (gian hàng còn đang thiết lập); gian hàng đã xong thì
 * chỉ hiện câu báo, nút Tiếp mặc định của wizard dùng lại.
 */
export function ShopSetupWizardStep({
  shopId,
  stepKey,
  slot,
  onAdvance,
  onGoStep,
  onOwnsAction,
}: {
  shopId: string;
  stepKey: ShopSetupKey;
  slot: HTMLElement | null;
  onAdvance: (key: WizardKey) => void | Promise<void>;
  onGoStep: (key: WizardKey) => void;
  onOwnsAction: (owns: boolean) => void;
}) {
  const shop = useShop(shopId);
  const connecting = shop.data?.status === 'connecting';
  const state = useSetupDraft(shopId, connecting);
  const groupData = useGroupStep(shopId, state, connecting && stepKey === 'assign_groups');
  const finish = useFinishSetup(shopId, state);
  const connector = useStartConnect();
  const [issues, setIssues] = useState<SetupIssue[]>([]);
  const [focus, setFocus] = useState<{ key: string | null; nonce: number }>({ key: null, nonce: 0 });
  const [advancing, setAdvancing] = useState(false);

  useEffect(() => {
    onOwnsAction(Boolean(connecting));
    return () => onOwnsAction(false);
  }, [connecting, onOwnsAction]);

  if (shop.isLoading) return <PageSpinner />;
  if (shop.isError || !shop.data) return <AlertMessage severity="error">{problemMessage(shop.error)}</AlertMessage>;
  const s = shop.data;
  if (!connecting) {
    return <AlertMessage severity="success">Gian hàng đã hoàn tất thiết lập. Bấm Tiếp để sang bước sau.</AlertMessage>;
  }

  const platformName = platformLabel(s.platform, s.platformName);
  const needDays = s.capabilities.returnWindow === 'days';
  const firstShop = state.view.data?.firstShopOfCompany === true;
  const draft = state.draft;

  const goTo = (it: SetupIssue) => {
    setIssues([]);
    finish.clear();
    onGoStep(it.step);
    if (it.rowKey) setFocus((f) => ({ key: it.rowKey, nonce: f.nonce + 1 }));
  };

  const next = async () => {
    setIssues([]);
    setAdvancing(true);
    try {
      const confirm = CONFIRMS[stepKey];
      if (confirm) {
        const out = await state.confirm(confirm);
        if (!out.ok) {
          if (out.invalid) setIssues(setupIssues(getProblem(out.error), state.draft));
          return;
        }
      }
      await onAdvance(stepKey);
    } finally {
      setAdvancing(false);
    }
  };

  const finishNow = async () => {
    setAdvancing(true);
    try {
      if (await finish.run()) await onAdvance(stepKey);
    } finally {
      setAdvancing(false);
    }
  };

  // Lý do Tiếp bị khoá, kèm chỗ sửa (CLAUDE.md "Lỗi phải chỉ chỗ sửa")
  const why: ReactNode =
    stepKey === 'assign_groups' && groupData.missing > 0 ? (
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
    ) : stepKey === 'stock_sync' && !draft?.openingStock ? (
      'Chọn cách đồng bộ tồn lần đầu.'
    ) : stepKey === 'stock_sync' && needDays && draft?.returnWindowDays == null ? (
      'Nhập hạn trả hàng.'
    ) : null;
  const blocked = Boolean(why) || advancing || state.saving || state.conflict || state.needsReauth;

  const action =
    stepKey === 'order_cutoff' ? (
      <Button disabled={finish.pending || advancing || state.saving || state.conflict} onClick={() => void finishNow()}>
        <Check />
        {finish.pending ? 'Đang hoàn tất...' : 'Hoàn tất thiết lập gian hàng'}
      </Button>
    ) : (
      <Button disabled={blocked} onClick={() => void next()}>
        Tiếp
      </Button>
    );

  return (
    <div className="grid gap-4">
      <DraftNotices state={state} onReconnect={() => void connector.start({ platform: s.platform, shopId: s.id })} />
      {state.view.isError && <AlertMessage severity="error">{problemMessage(state.view.error)}</AlertMessage>}
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
      {!state.view.data ? (
        <PageSpinner />
      ) : stepKey === 'link_skus' ? (
        <>
          <SkuLinkList
            shopId={s.id}
            mode="draft"
            draft={draft}
            draftVersion={state.draftVersion}
            onDraftSaved={state.applySaved}
            onConflict={() => void state.reload()}
            showSkip
          />
          <CategorySyncBlock shopId={s.id} platform={s.platform} platformName={platformName} />
        </>
      ) : stepKey === 'assign_groups' ? (
        <>
          <GroupsStep data={groupData} state={state} focusProductId={focus.key} focusNonce={focus.nonce} />
          <CategorySyncBlock shopId={s.id} platform={s.platform} platformName={platformName} />
        </>
      ) : stepKey === 'stock_sync' ? (
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
      {why && (
        <p className="text-sm text-muted-foreground" data-testid="setup-why">
          {why}
        </p>
      )}
      {slot && createPortal(action, slot)}
    </div>
  );
}
