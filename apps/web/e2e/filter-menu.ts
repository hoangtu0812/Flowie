import { expect, type Page } from '@playwright/test';

/**
 * Opens the issue Filter menu and picks one of its sections.
 *
 * A click on Filter that lands before the page has hydrated does nothing, and
 * an Escape that is still closing the previous menu swallows the next click, so
 * one click is not enough on a slow runner: the section option never appears
 * and the test waits out its whole budget. This clicks again only while the
 * section is still missing, then picks it.
 *
 * VI: Mở menu Filter của danh sách issue và chọn một mục trong đó.
 * VI: Một cú bấm Filter tới trước khi trang hydrate xong sẽ không làm gì, và lệnh
 * VI: Escape còn đang đóng menu trước sẽ nuốt cú bấm kế tiếp, nên trên máy chạy
 * VI: chậm một cú bấm là không đủ: mục cần chọn không bao giờ hiện ra và test chờ
 * VI: hết toàn bộ thời gian. Hàm này chỉ bấm lại khi mục đó vẫn chưa có, rồi chọn.
 */
export async function openFilterSection(page: Page, section: string) {
   const option = page.getByRole('option', { name: section, exact: true });
   await expect(async () => {
      if (!(await option.isVisible())) {
         await page.getByRole('button', { name: 'Filter', exact: true }).first().click();
      }
      await expect(option).toBeVisible({ timeout: 2000 });
   }).toPass({ timeout: 15000 });
   await option.click();
}
