import * as catalog from '../catalogData';
import type { MockPurchaseRequest, MockPurchaseRequestLine, MockSupplierReturn } from '../purchasingData';
import type { NewProductInput } from '@/types/purchasing';
import { nextVariant, rid } from './catalog';

type Errors = Record<string, string>;

const MAX_AXES = 2;
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

/** Trục (tên thuộc tính) của sản phẩm có sẵn, theo SKU đầu tiên */
function axesOf(product: catalog.MockProduct): string[] {
  const first = product.variants[0];
  if (!first) return [];
  return first.valueIds.map((id) => catalog.attributes.find((a) => a.values.some((v) => v.id === id))?.name ?? '');
}

function comboOfVariant(product: catalog.MockProduct, valueIds: string[]): string {
  const axes = axesOf(product);
  return axes
    .map((axis, k) => {
      const attr = catalog.attributes.find((a) => a.name === axis && a.companyId === product.companyId);
      return norm(attr?.values.find((v) => v.id === valueIds[k])?.value ?? '');
    })
    .join('|');
}

const comboOf = (axes: string[], values: Record<string, string>) => axes.map((a) => norm(values[a] ?? '')).join('|');

/**
 * Dòng sản phẩm mới theo Documents/21: cha có sẵn (`parentId`) hoặc cha mới (`parentName` + danh mục), giá trị
 * theo trục; các dòng cùng tên cha mới gộp một cha, tối đa 2 trục, không trùng tổ hợp. Lỗi ở `lines.<i>.newProduct.*`.
 * BE cũ chỉ gửi `name` thì coi `name` là tên cha mới không trục.
 */
export function validateNewProducts(
  companyId: string,
  raw: { index: number; input: Partial<NewProductInput> }[],
  errors: Errors,
): Map<number, NewProductInput> {
  const out = new Map<number, NewProductInput>();
  const groups = new Map<string, { index: number; axes: string[]; values: Record<string, string> }[]>();
  for (const { index, input } of raw) {
    const path = `lines.${index}.newProduct`;
    const values: Record<string, string> = {};
    for (const [axis, value] of Object.entries(input.optionValues ?? {})) {
      const a = String(axis).trim();
      const v = String(value ?? '').trim();
      if (a) values[a] = v;
    }
    const axes = Object.keys(values);
    if (axes.some((a) => !values[a])) errors[`${path}.optionValues`] = 'Nhập giá trị cho mọi trục';
    else if (axes.some((a) => !catalog.attributes.some((x) => x.companyId === companyId && x.name === a))) {
      errors[`${path}.optionValues`] = 'Trục phân loại không có trong thuộc tính của công ty';
    }
    let categoryId = String(input.categoryId ?? '');
    let parentName = String(input.parentName ?? input.name ?? '').trim();
    let key: string;
    if (input.parentId) {
      const parent = catalog.products.find((p) => p.id === input.parentId && p.companyId === companyId && !p.archivedAt);
      if (!parent) {
        errors[`${path}.parentId`] = 'Chọn sản phẩm cha';
        continue;
      }
      categoryId = parent.categoryId;
      parentName = parent.name;
      const parentAxes = axesOf(parent);
      if (parentAxes.join('|') !== axes.join('|') && !errors[`${path}.optionValues`]) {
        errors[`${path}.optionValues`] = `Nhập giá trị theo trục của sản phẩm cha: ${parentAxes.join(', ') || 'không có trục'}`;
      } else if (parent.variants.some((v) => comboOfVariant(parent, v.valueIds) === comboOf(parentAxes, values))) {
        errors[`${path}.optionValues`] = 'Phân loại này đã có trong sản phẩm cha';
      }
      key = `id:${parent.id}`;
    } else {
      if (!parentName) errors[`${path}.parentName`] = 'Nhập tên sản phẩm cha';
      else if (parentName.length > 120) errors[`${path}.parentName`] = 'Tối đa 120 ký tự';
      else if (catalog.products.some((p) => p.companyId === companyId && !p.archivedAt && norm(p.name) === norm(parentName))) {
        errors[`${path}.parentName`] = 'Tên đã có sản phẩm, chọn Cha có sẵn';
      }
      if (!catalog.categories.some((c) => c.id === categoryId && c.companyId === companyId)) {
        errors[`${path}.categoryId`] = 'Chọn danh mục';
      }
      key = `new:${norm(parentName)}`;
    }
    const name = String(input.name ?? '').trim() || [parentName, ...axes.map((a) => values[a])].join(' ');
    out.set(index, {
      parentId: input.parentId ?? null,
      parentName: input.parentId ? null : parentName,
      categoryId,
      optionValues: values,
      name: name.slice(0, 120),
    });
    groups.set(key, [...(groups.get(key) ?? []), { index, axes, values }]);
  }

  for (const [key, members] of groups) {
    const isNew = key.startsWith('new:');
    if (isNew) {
      const axes = [...new Set(members.flatMap((m) => m.axes))];
      if (axes.length > MAX_AXES) {
        for (const m of members) errors[`lines.${m.index}.newProduct.optionValues`] ??= `Tối đa ${MAX_AXES} trục phân loại`;
        continue;
      }
      const mismatch = members.find((m) => m.axes.slice().sort().join('|') !== axes.slice().sort().join('|'));
      if (mismatch) {
        errors[`lines.${mismatch.index}.newProduct.optionValues`] ??= `Các dòng cùng cha phải có đủ trục: ${axes.join(', ')}`;
        continue;
      }
    }
    const seen = new Set<string>();
    for (const m of members) {
      const combo = comboOf(m.axes.slice().sort(), m.values);
      if (seen.has(combo)) errors[`lines.${m.index}.newProduct.optionValues`] ??= 'Trùng phân loại với dòng khác cùng cha';
      seen.add(combo);
    }
  }
  return out;
}

/** Giá trị thuộc tính theo tên; chưa có thì tạo (mã SKU từ chữ cái đầu, không dấu) */
function valueIdOf(companyId: string, axis: string, value: string): string {
  const attr = catalog.attributes.find((a) => a.companyId === companyId && a.name === axis)!;
  const found = attr.values.find((v) => norm(v.value) === norm(value));
  if (found) return found.id;
  const base =
    value
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/đ/gi, 'D')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 4) || 'V';
  let code = base;
  for (let n = 2; attr.values.some((v) => v.code === code); n++) code = `${base}${n}`;
  const id = rid('val');
  attr.values.push({ id, value: value.trim(), code });
  attr.version += 1;
  return id;
}

/** Duyệt: dòng cùng cha gộp một sản phẩm; cha có sẵn thêm SKU vào sản phẩm đó */
export function createNewProducts(req: MockPurchaseRequest, at: string) {
  const created = new Map<string, catalog.MockProduct>();
  for (const l of req.lines) {
    if (l.excluded || !l.newProduct || l.variantId) continue;
    const np = l.newProduct;
    const parentName = np.parentName ?? np.name;
    const key = np.parentId ? `id:${np.parentId}` : `new:${norm(parentName)}`;
    let product = np.parentId
      ? catalog.products.find((p) => p.id === np.parentId)
      : (created.get(key) ?? undefined);
    const category = catalog.categories.find((c) => c.id === (product?.categoryId ?? np.categoryId))!;
    if (!product) {
      product = {
        id: rid('prd'),
        companyId: req.companyId,
        categoryId: category.id,
        name: parentName,
        description: `Tạo từ đơn đặt hàng nhập ${req.number}`,
        imageFileIds: [],
        variants: [],
        archivedAt: null,
        updatedAt: at,
        version: 0,
      };
      catalog.products.push(product);
      created.set(key, product);
    }
    const axes = np.parentId ? axesOf(product) : Object.keys(np.optionValues ?? {}).sort();
    const valueIds = axes.map((axis) => valueIdOf(req.companyId, axis, np.optionValues?.[axis] ?? ''));
    const variant = nextVariant(category, valueIds);
    product.variants.push(variant);
    product.updatedAt = at;
    product.version += 1;
    l.variantId = variant.id;
  }
}

/**
 * Đề nghị bù hàng (commerio-backend#365): mỗi dòng là SKU có trên phiếu trả, số không quá số đã trả,
 * giá bằng giá dòng gốc. Lỗi ở `lines.<i>.variantId|quantity|unitCost`.
 */
export function checkReplacementLines(source: MockSupplierReturn, lines: MockPurchaseRequestLine[], errors: Errors) {
  lines.forEach((l, i) => {
    const path = `lines.${i}`;
    const orig = l.variantId ? source.lines.find((r) => r.variantId === l.variantId) : undefined;
    if (!orig) {
      errors[`${path}.variantId`] ??= `SKU không có trên phiếu trả hàng NCC ${source.number}`;
      return;
    }
    if (l.quantity > orig.quantity) errors[`${path}.quantity`] ??= `Không quá số đã trả ${orig.quantity}`;
    if (orig.unitCost !== null && l.unitCost !== orig.unitCost) errors[`${path}.unitCost`] ??= 'Giá phải bằng giá dòng gốc';
  });
}
