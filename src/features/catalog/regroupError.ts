/** Câu cho lỗi 409 của `POST …/regroup` (Documents/21 §18.8.4); mã khác dùng câu chung */
export function regroupErrorText(code: string | undefined, platform: string, fallback: string): string {
  switch (code) {
    case 'shop_not_active':
    case 'shop_not_connected':
      return `Gian hàng chưa kết nối hoặc đang tạm dừng. Kết nối lại gian hàng ${platform} rồi gom.`;
    case 'nothing_to_regroup':
      return `Các SKU đã nằm chung một sản phẩm trên ${platform}, không cần gom.`;
    case 'invalid_transition':
      return 'Có SKU đang đẩy lên sàn, đang có thay đổi ngoài app hoặc đang chờ duyệt ghép. Xử lý xong rồi gom lại.';
    case 'push_blocked':
      return `Sản phẩm còn thiếu thông tin ${platform} bắt buộc. Điền đủ ở tab này rồi gom lại.`;
    default:
      return fallback;
  }
}
