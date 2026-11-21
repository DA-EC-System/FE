import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowDown, ArrowLeft, ArrowUp, Eye, EyeOff, Lock, Plus, Settings2, Trash2, X } from 'lucide-react';
import { AlertMessage } from '@/components/common/AlertMessage';
import { RowAction } from '@/components/common/RowAction';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useAddTemplateField,
  useAttributes,
  useGroupTemplate,
  useGroups,
  useSetGroupHidden,
  useSpecFields,
  useUpdateGroupTemplate,
} from '@/api/catalog.api';
import { getProblem } from '@/api/client';
import { problemCode, problemMessage } from '@/api/problemMessages';
import { useAuth } from '@/hooks/useAuth';
import { useCan, useModuleEnabled } from '@/hooks/usePermission';
import { ROUTES } from '@/router/routes';
import { PERMISSIONS } from '@/utils/permissions';
import { isPlatform, type GroupTemplateInput, type SpecField } from '@/types/catalog';
import { GroupFormDialog } from './GroupFormDialog';
import { SpecFieldDialog } from './specs/SpecFieldDialog';
import { SpecOptionsDialog } from './specs/SpecOptionsDialog';
import { MAPPING_HINT, SpecMappingTabs } from './specs/SpecMappingDialog';
import { SPEC_INPUT_LABELS, hasOptions } from './specs/specLabels';

type FieldRow = { fieldId: string; required: boolean };
const NONE = '__none';

/**
 * Trang một danh mục sản phẩm (Documents/29 bước 3; Documents/21 §5.5–§5.7; phương án 1B cố vấn duyệt 22/11/2026):
 * biến thể theo và biến thể được phép, thuộc tính sản phẩm (thêm mới hoặc chọn có sẵn, một bước), lựa chọn và ánh xạ sàn
 * của từng thuộc tính ngay trong trang, cột phải xem trước form người bán sẽ điền.
 * Danh mục mặc định của hệ thống: dòng mặc định khoá; công ty chỉ thêm, sắp, bỏ phần của mình (PUT gửi phần công ty).
 */
export function CategoryDetailPage() {
  const { groupId = '' } = useParams();
  const companyId = useAuth().companyContext?.companyId ?? '';
  const can = useCan();
  const canManage = can(PERMISSIONS.catalogSetup);
  const showPlatforms = useModuleEnabled('channel') && can(PERMISSIONS.shopView);

  const groupsQuery = useGroups({ includeHidden: true });
  const group = groupsQuery.data?.find((g) => g.id === groupId);
  const templateQuery = useGroupTemplate(groupId);
  const libraryQuery = useSpecFields();
  const library = useMemo(() => libraryQuery.data ?? [], [libraryQuery.data]);
  const attributes = useAttributes().data ?? [];
  const saveMut = useUpdateGroupTemplate();
  const attachMut = useAddTemplateField();
  const hideMut = useSetGroupHidden();

  const [selected, setSelected] = useState<string | null>(null);
  const [picking, setPicking] = useState('');
  const [pickingAttr, setPickingAttr] = useState('');
  const [creatingField, setCreatingField] = useState(false);
  const [editingField, setEditingField] = useState<SpecField | null>(null);
  const [optionsOf, setOptionsOf] = useState<SpecField | null>(null);
  const [suggestOpen, setSuggestOpen] = useState(false);

  const template = templateQuery.data;
  const platform = Boolean(group && isPlatform(group));
  const editable = canManage;
  const byId = useMemo(() => new Map(library.map((f) => [f.id, f])), [library]);

  // Dòng mặc định (khoá) và dòng công ty (sửa được); danh mục tự tạo thì mọi dòng là của công ty
  const lockedFields = platform ? (template?.fields ?? []).filter(isPlatform) : [];
  const ownFields: FieldRow[] = (platform ? (template?.fields ?? []).filter((f) => !isPlatform(f)) : (template?.fields ?? [])).map(
    (f) => ({ fieldId: f.fieldId, required: f.required }),
  );
  const allowed = template?.allowedAttributes ?? [];
  const lockedAllowed = platform ? allowed.filter(isPlatform) : [];
  const ownAllowedIds = (platform ? allowed.filter((a) => !isPlatform(a)) : allowed).map((a) => a.attributeId);
  const axisIds = template?.axes.map((a) => a.attributeId) ?? [];

  /** Ghi mẫu: danh mục mặc định chỉ gửi phần công ty, không gửi trục (Documents/21 §5.6, §5.7) */
  const save = async (next: { fields?: FieldRow[]; allowed?: string[]; axes?: string[] }, message: string) => {
    if (!template) return;
    const body: GroupTemplateInput = {
      fields: next.fields ?? ownFields,
      version: template.version,
      ...((next.allowed ?? template.allowedAttributes) && { allowedAttributeIds: next.allowed ?? ownAllowedIds }),
      ...(!platform && { axisAttributeIds: next.axes ?? axisIds }),
    };
    try {
      await saveMut.mutateAsync({ groupId, ...body });
      toast.success(message);
    } catch (e) {
      if (problemCode(e) === 'version_conflict') {
        void templateQuery.refetch();
        toast.warning('Danh mục vừa được người khác sửa. Đã nạp bản mới nhất, chưa có gì thay đổi.');
        return;
      }
      const first = Object.values(getProblem(e)?.errors ?? {})[0];
      toast.error(first ?? problemMessage(e));
    }
  };

  const attachExisting = async () => {
    if (!template || !picking) return;
    const f = byId.get(picking);
    try {
      await attachMut.mutateAsync({ groupId, field: { fieldId: picking }, required: false, version: template.version });
      toast.success(`Đã thêm ${f?.name ?? 'thuộc tính'} vào ${group?.name}`);
      setPicking('');
      setSelected(picking);
    } catch (e) {
      if (problemCode(e) === 'version_conflict') void templateQuery.refetch();
      toast.error(getProblem(e)?.errors?.fieldId ?? problemMessage(e));
    }
  };

  const toggleHidden = async () => {
    if (!group) return;
    try {
      await hideMut.mutateAsync({ id: group.id, hidden: !group.hidden });
      toast.success(group.hidden ? `Đã hiện lại ${group.name}` : `Đã ẩn ${group.name}. Sản phẩm đang ở danh mục này không đổi.`);
    } catch (e) {
      toast.error(problemMessage(e));
    }
  };

  const inTemplate = new Set([...lockedFields.map((f) => f.fieldId), ...ownFields.map((f) => f.fieldId)]);
  const freeFields = library.filter((f) => !inTemplate.has(f.id));
  const inAllowed = new Set(allowed.map((a) => a.attributeId));
  const freeAttrs = attributes.filter((a) => !inAllowed.has(a.id));
  const selectedField = selected ? byId.get(selected) : undefined;
  const busy = saveMut.isPending || attachMut.isPending;

  if (groupsQuery.isLoading || templateQuery.isLoading) {
    return (
      <div className="grid gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (!group || templateQuery.isError || !template) {
    return (
      <div className="grid gap-4">
        <BackLink companyId={companyId} />
        <AlertMessage severity="error">
          {templateQuery.isError ? problemMessage(templateQuery.error) : 'Không tìm thấy danh mục này.'}
        </AlertMessage>
      </div>
    );
  }

  const fieldLine = (row: FieldRow, locked: boolean, i: number) => {
    const f = byId.get(row.fieldId) ?? template.fields.find((x) => x.fieldId === row.fieldId);
    const name = f?.name ?? row.fieldId;
    const active = selected === row.fieldId;
    return (
      <li
        key={row.fieldId}
        className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border px-3 py-1.5 ${locked ? 'bg-muted/50' : ''} ${active ? 'border-primary' : ''}`}
      >
        {locked && <Lock className="size-3.5 shrink-0 text-muted-foreground" aria-label="Mặc định của hệ thống" />}
        <button
          type="button"
          className="min-h-6 min-w-0 flex-1 cursor-pointer text-left"
          aria-pressed={active}
          onClick={() => setSelected(active ? null : row.fieldId)}
        >
          <span className="font-medium">{name}</span>
          {f && <span className="ml-2 text-xs text-muted-foreground">{SPEC_INPUT_LABELS[f.input]}</span>}
        </button>
        {locked || !editable ? (
          row.required ? (
            <Badge variant="secondary">Bắt buộc</Badge>
          ) : (
            <span className="text-sm text-muted-foreground">Tuỳ chọn</span>
          )
        ) : (
          <>
            <label className="flex min-h-6 items-center gap-2 text-sm">
              <Checkbox
                checked={row.required}
                disabled={busy}
                onCheckedChange={(v) =>
                  void save(
                    { fields: ownFields.map((x, j) => (j === i ? { ...x, required: v === true } : x)) },
                    v === true ? `${name} thành bắt buộc` : `${name} thành tuỳ chọn`,
                  )
                }
              />
              Bắt buộc
            </label>
            <span className="flex">
              <RowAction
                label="Lên trên"
                reason={i === 0 ? 'Đã ở đầu' : busy ? 'Đang lưu' : null}
                onClick={() => void save({ fields: move(ownFields, i, i - 1) }, 'Đã đổi thứ tự')}
              >
                <ArrowUp />
              </RowAction>
              <RowAction
                label="Xuống dưới"
                reason={i === ownFields.length - 1 ? 'Đã ở cuối' : busy ? 'Đang lưu' : null}
                onClick={() => void save({ fields: move(ownFields, i, i + 1) }, 'Đã đổi thứ tự')}
              >
                <ArrowDown />
              </RowAction>
              <RowAction
                label="Bỏ khỏi danh mục"
                destructive
                reason={busy ? 'Đang lưu' : null}
                onClick={() => {
                  if (selected === row.fieldId) setSelected(null);
                  void save({ fields: ownFields.filter((_, j) => j !== i) }, `Đã bỏ ${name} khỏi ${group.name}`);
                }}
              >
                <Trash2 />
              </RowAction>
            </span>
          </>
        )}
      </li>
    );
  };

  return (
    <div className="grid gap-4">
      <BackLink companyId={companyId} />
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold">
            {group.name}
            <Badge variant={platform ? 'secondary' : 'outline'}>{platform ? 'Mặc định của hệ thống' : 'Tự tạo'}</Badge>
            {group.hidden && <Badge variant="outline">Đã ẩn</Badge>}
          </h1>
          <p className="text-sm text-muted-foreground">
            {platform
              ? 'Dùng chung mọi công ty: phần có khoá không sửa, không bỏ được. Thêm được thuộc tính sản phẩm và biến thể riêng của công ty.'
              : 'Danh mục công ty tự tạo: sửa mọi phần.'}
            {group.renamedFrom && ` Tên cũ: ${group.renamedFrom}.`}
          </p>
        </div>
        {editable && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setSuggestOpen(true)}>
              <Settings2 />
              {platform ? 'Gợi ý giá, ngưỡng tồn' : 'Tên, gợi ý giá, ngưỡng tồn'}
            </Button>
            {platform && (
              <Button variant="outline" onClick={() => void toggleHidden()} disabled={hideMut.isPending}>
                {group.hidden ? <Eye /> : <EyeOff />}
                {group.hidden ? 'Hiện lại' : 'Ẩn danh mục'}
              </Button>
            )}
          </div>
        )}
      </div>

      {Boolean(group.splitInto?.length) && (
        <AlertMessage severity="info">
          Danh mục {group.renamedFrom ?? group.name} đã tách thành {group.splitInto?.map((s) => s.name).join(', ')}. Sản phẩm đang ở
          đây không tự chuyển; mở từng sản phẩm để chọn danh mục phù hợp hơn.
        </AlertMessage>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="grid min-w-0 gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Biến thể theo</CardTitle>
              <CardDescription>
                Chọn sẵn khi tạo sản phẩm thuộc danh mục này (tối đa 2), đổi được trên từng sản phẩm.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              {platform || !editable ? (
                <p className="flex flex-wrap items-center gap-1.5">
                  {platform && <Lock className="size-3.5 text-muted-foreground" aria-hidden />}
                  {template.axes.length ? (
                    template.axes.map((a) => (
                      <Badge key={a.attributeId} variant="secondary">
                        {a.name}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-muted-foreground">Không có biến thể</span>
                  )}
                </p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {[0, 1].map((i) => (
                    <Select
                      key={i}
                      value={axisIds[i] ?? NONE}
                      disabled={busy || (i === 1 && !axisIds[0])}
                      onValueChange={(v) => {
                        const next = [...axisIds];
                        if (v === NONE) next.splice(i);
                        else next[i] = v;
                        void save({ axes: next.filter(Boolean) }, 'Đã lưu biến thể theo');
                      }}
                    >
                      <SelectTrigger className="w-full" aria-label={`Biến thể theo, thứ ${i + 1}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>Không có</SelectItem>
                        {attributes
                          .filter((a) => a.id === axisIds[i] || !axisIds.includes(a.id))
                          .map((a) => (
                            <SelectItem key={a.id} value={a.id}>
                              {a.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  ))}
                </div>
              )}

              {template.allowedAttributes && (
                <div className="grid gap-2">
                  <h3 className="text-sm font-medium">Thuộc tính biến thể hợp với danh mục</h3>
                  <p className="text-sm text-muted-foreground">
                    Ô chọn biến thể ở form sản phẩm gợi ý theo danh sách này. Chọn thuộc tính ngoài danh sách vẫn lưu được.
                  </p>
                  <ul className="flex flex-wrap gap-1">
                    {lockedAllowed.map((a) => (
                      <li key={a.attributeId}>
                        <Badge variant="outline">
                          <Lock className="size-3" aria-hidden />
                          {a.name}
                        </Badge>
                      </li>
                    ))}
                    {ownAllowedIds.map((id) => {
                      const a = allowed.find((x) => x.attributeId === id);
                      return (
                        <li key={id}>
                          <Badge variant="secondary" className="gap-1 pr-0.5">
                            {a?.name ?? id}
                            {editable && !axisIds.includes(id) && (
                              <button
                                type="button"
                                className="inline-flex size-6 cursor-pointer items-center justify-center rounded-sm hover:bg-muted disabled:opacity-50"
                                aria-label={`Bỏ ${a?.name ?? ''} khỏi danh sách`}
                                disabled={busy}
                                onClick={() => void save({ allowed: ownAllowedIds.filter((x) => x !== id) }, `Đã bỏ ${a?.name ?? ''}`)}
                              >
                                <X className="size-3.5" />
                              </button>
                            )}
                          </Badge>
                        </li>
                      );
                    })}
                  </ul>
                  {editable && freeAttrs.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2">
                      <Select value={pickingAttr} onValueChange={setPickingAttr} disabled={busy}>
                        <SelectTrigger className="w-full sm:w-64" aria-label="Thêm thuộc tính biến thể vào danh sách">
                          <SelectValue placeholder="Thêm thuộc tính biến thể" />
                        </SelectTrigger>
                        <SelectContent>
                          {freeAttrs.map((a) => (
                            <SelectItem key={a.id} value={a.id}>
                              {a.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!pickingAttr || busy}
                        onClick={() => {
                          void save({ allowed: [...ownAllowedIds, pickingAttr] }, 'Đã thêm vào danh sách');
                          setPickingAttr('');
                        }}
                      >
                        Thêm
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Thuộc tính sản phẩm ({lockedFields.length + ownFields.length})</CardTitle>
              <CardDescription>
                Ô người bán điền khi tạo sản phẩm thuộc danh mục này. Bấm một thuộc tính để xem lựa chọn và ánh xạ sang sàn.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {lockedFields.length > 0 && (
                <>
                  <h3 className="text-xs font-medium text-muted-foreground">Mặc định của hệ thống · {lockedFields.length}</h3>
                  <ol className="grid gap-1">{lockedFields.map((f, i) => fieldLine({ fieldId: f.fieldId, required: f.required }, true, i))}</ol>
                  <h3 className="mt-1 text-xs font-medium text-muted-foreground">Tự thêm · {ownFields.length}</h3>
                </>
              )}
              {ownFields.length ? (
                <ol className="grid gap-1">{ownFields.map((r, i) => fieldLine(r, false, i))}</ol>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {platform ? 'Chưa thêm thuộc tính riêng.' : 'Chưa có thuộc tính nào.'}
                </p>
              )}

              {editable && (
                <div className="grid gap-2 rounded-md border border-dashed p-3">
                  <p className="text-sm font-medium">Thêm thuộc tính sản phẩm</p>
                  <div className="flex flex-wrap items-center gap-2">
                    {freeFields.length > 0 && (
                      <>
                        <Select value={picking} onValueChange={setPicking} disabled={busy}>
                          <SelectTrigger className="w-full sm:w-64" aria-label="Thuộc tính có sẵn">
                            <SelectValue placeholder="Chọn thuộc tính có sẵn" />
                          </SelectTrigger>
                          <SelectContent>
                            {freeFields.map((f) => (
                              <SelectItem key={f.id} value={f.id}>
                                {f.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button variant="outline" size="sm" disabled={!picking || busy} onClick={() => void attachExisting()}>
                          Thêm
                        </Button>
                        <span className="text-sm text-muted-foreground">hoặc</span>
                      </>
                    )}
                    <Button variant="outline" size="sm" onClick={() => setCreatingField(true)} disabled={busy}>
                      <Plus />
                      Tạo thuộc tính mới
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {selectedField && (
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <CardTitle>{selectedField.name}</CardTitle>
                    <CardDescription>
                      {SPEC_INPUT_LABELS[selectedField.input]}
                      {selectedField.unit ? ` (${selectedField.unit})` : ''}
                      {isPlatform(selectedField) ? ' · Mặc định của hệ thống' : ' · Tự tạo'}
                      {selectedField.groupCount > 1 && ` · dùng ở ${selectedField.groupCount} danh mục`}
                    </CardDescription>
                  </div>
                  {editable &&
                    (isPlatform(selectedField) ? (
                      hasOptions(selectedField.input) && (
                        <Button variant="outline" size="sm" onClick={() => setOptionsOf(selectedField)}>
                          Lựa chọn tự thêm
                        </Button>
                      )
                    ) : (
                      <Button variant="outline" size="sm" onClick={() => setEditingField(selectedField)}>
                        Sửa thuộc tính
                      </Button>
                    ))}
                </div>
              </CardHeader>
              <CardContent className="grid gap-4">
                {hasOptions(selectedField.input) && (
                  <div className="flex flex-wrap gap-1">
                    {[...selectedField.options]
                      .sort((a, b) => a.position - b.position)
                      .map((o) => (
                        <Badge key={o.id} variant="outline">
                          {o.value}
                          {isPlatform(selectedField) && o.scope === 'company' && <span className="text-muted-foreground">tự thêm</span>}
                        </Badge>
                      ))}
                    {!selectedField.options.length && <span className="text-sm text-muted-foreground">Chưa có lựa chọn, điền tự do</span>}
                  </div>
                )}
                {showPlatforms && (
                  <section aria-label="Ánh xạ sang sàn" className="grid gap-2">
                    <h3 className="text-sm font-medium">Ánh xạ sang sàn</h3>
                    <p className="text-sm text-muted-foreground">{MAPPING_HINT(selectedField.name)}</p>
                    <SpecMappingTabs key={selectedField.id} field={selectedField} canEdit={editable} />
                  </section>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        <aside aria-label="Xem trước form sản phẩm" className="lg:sticky lg:top-4 lg:self-start">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Người bán sẽ thấy khi tạo sản phẩm</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm">
              <PreviewField label="Danh mục sản phẩm" value={group.name} />
              <PreviewField
                label="Biến thể theo"
                value={template.axes.length ? template.axes.map((a) => a.name).join(', ') : 'Không có biến thể'}
              />
              {template.fields.map((f) => (
                <PreviewField key={f.fieldId} label={`${f.name}${f.required ? ' *' : ''}`} value={SPEC_INPUT_LABELS[f.input]} muted />
              ))}
              <p className="text-xs text-muted-foreground">Dấu * là bắt buộc: thiếu thì sản phẩm còn "Chờ hoàn thiện", vẫn lưu được.</p>
            </CardContent>
          </Card>
        </aside>
      </div>

      <GroupFormDialog
        open={suggestOpen}
        group={group}
        onClose={() => setSuggestOpen(false)}
        onDone={(message) => {
          setSuggestOpen(false);
          toast.success(message);
        }}
      />
      <SpecFieldDialog
        open={creatingField || Boolean(editingField)}
        field={editingField}
        attachTo={creatingField ? { groupId, groupName: group.name, version: template.version } : undefined}
        onClose={() => {
          setCreatingField(false);
          setEditingField(null);
        }}
        onDone={(message) => {
          setCreatingField(false);
          setEditingField(null);
          toast.success(message);
        }}
      />
      <SpecOptionsDialog field={optionsOf} onClose={() => setOptionsOf(null)} />
    </div>
  );
}

function move<T>(list: T[], from: number, to: number) {
  const next = [...list];
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x);
  return next;
}

function BackLink({ companyId }: { companyId: string }) {
  return (
    <Link to={ROUTES.company.catalogSetup(companyId)} className="inline-flex w-fit items-center gap-1 text-sm text-primary-text hover:underline">
      <ArrowLeft className="size-4" aria-hidden />
      Danh mục sản phẩm
    </Link>
  );
}

function PreviewField({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="grid gap-1">
      <span className="font-medium">{label}</span>
      <span className={`rounded-md border px-2 py-1 ${muted ? 'text-muted-foreground' : ''}`}>{value}</span>
    </div>
  );
}

