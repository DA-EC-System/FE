/** id của ô trên trang đẩy lên sàn, để nhảy tới từ dòng "còn thiếu" và lỗi 422 của BE */
export const fieldId = (code: string) => `spec-attr-${code.replace(/\W/g, '_')}`;
export const axisFieldId = (attributeId: string) => `spec-axis-${attributeId}`;
export const valueFieldId = (valueId: string) => `spec-value-${valueId}`;
