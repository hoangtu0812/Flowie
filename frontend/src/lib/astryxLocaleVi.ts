/**
 * Chuỗi tiếng Việt cho component Astryx.
 *
 * Astryx chỉ ship sẵn en / fr-FR, không có vi. Nhưng
 * InternationalizationProvider nhận `overrides` dạng thưa: key nào không khai
 * ở đây sẽ tự rơi về catalog `en`. Nhờ vậy không cần dịch cả 219 chuỗi, chỉ
 * dịch những chuỗi thực sự hiện ra trong Flowie.
 *
 * Khi dùng thêm component Astryx mới mà thấy chữ tiếng Anh lọt ra, tìm key
 * tương ứng trong node_modules/@astryxdesign/core/locales/en.json rồi bổ sung
 * vào đây — đừng vá bằng prop label ở từng chỗ gọi.
 *
 * Placeholder dạng {name}, {page, number} phải giữ NGUYÊN VĂN, kể cả phần
 * `, number` — đó là cú pháp ICU MessageFormat, không phải chữ hiển thị.
 */
export const astryxVi: Record<string, string> = {
  // ── Điều hướng ──
  "@astryx.sideNav.label": "Điều hướng bên",
  "@astryx.sideNav.resizeSidebar": "Đổi độ rộng thanh bên",
  "@astryx.sideNav.heading.openMenu": "Mở menu",
  "@astryx.sideNavCollapseButton.expandSidebar": "Mở rộng thanh bên",
  "@astryx.sideNavCollapseButton.collapseSidebar": "Thu gọn thanh bên",
  "@astryx.sideNavItem.expand": "Mở rộng {label}",
  "@astryx.sideNavItem.collapse": "Thu gọn {label}",
  "@astryx.appShell.mobileNavigation": "Điều hướng di động",
  "@astryx.mobileNav.closeNavigation": "Đóng điều hướng",

  // ── Hộp thoại / thông báo ──
  "@astryx.dialog.close": "Đóng",
  "@astryx.alertDialog.cancel": "Huỷ",
  "@astryx.banner.dismiss": "Bỏ qua",
  "@astryx.banner.collapse": "Thu gọn",
  "@astryx.banner.expand": "Mở rộng",

  // ── Bảng ──
  "@astryx.table.label": "Bảng",
  "@astryx.table.noData": "Không có dữ liệu",
  "@astryx.table.filter.allPlaceholder": "Tất cả",
  "@astryx.table.filter.reset": "Đặt lại",
  "@astryx.table.filter.apply": "Áp dụng",
  "@astryx.table.selection.selectAllRows": "Chọn tất cả các dòng",
  "@astryx.table.selection.selectRow": "Chọn dòng",
  "@astryx.table.selection.selectRowNamed": "Chọn {label}",
  "@astryx.table.sort.ascending": "Sắp xếp tăng dần",
  "@astryx.table.sort.descending": "Sắp xếp giảm dần",
  "@astryx.table.sort.clear": "Bỏ sắp xếp",
  "@astryx.tableRowExpansion.expandRow": "Mở rộng dòng",
  "@astryx.tableRowExpansion.collapseRow": "Thu gọn dòng",
  "@astryx.tableRowExpansion.expandAllRows": "Mở rộng tất cả các dòng",
  "@astryx.tableRowExpansion.collapseAllRows": "Thu gọn tất cả các dòng",

  // ── Phân trang ──
  "@astryx.pagination.label": "Phân trang",
  "@astryx.pagination.previous": "Về trang trước",
  "@astryx.pagination.next": "Sang trang sau",
  "@astryx.pagination.goToPage": "Đến trang {page, number}",
  "@astryx.pagination.itemsPerPage": "Số dòng mỗi trang",
  "@astryx.pagination.count": "{from, number}–{to, number} trên {total, number}",
  "@astryx.pagination.pageOfTotal": "Trang {current, number} trên {total, number}",
  "@astryx.pagination.pageAnnounce": "Trang {current, number}",

  // ── Chọn / tìm kiếm ──
  "@astryx.selector.searchPlaceholder": "Tìm kiếm…",
  "@astryx.selector.searchOptions": "Tìm trong danh sách",
  "@astryx.multiSelector.selectAll": "Chọn tất cả",
  "@astryx.multiSelector.searchPlaceholder": "Tìm kiếm…",
  "@astryx.multiSelector.searchOptions": "Tìm trong danh sách",

  // ── Lịch ──
  "@astryx.calendar.previousMonth": "Tháng trước",
  "@astryx.calendar.nextMonth": "Tháng sau",

  // ── Avatar ──
  "@astryx.avatarGroup.label": "Danh sách người dùng",
  "@astryx.avatarGroup.keyboardHint": "Dùng phím mũi tên để di chuyển giữa các avatar",
};
