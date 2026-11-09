import { attachmentPreviewUrl } from '@/lib/attachments';

/**
 * Absolute link to the Flowie page that shows an uploaded HTML file under a warning header. Open
 * in new tab and Copy link use it instead of the raw preview URL, which the API redirects here
 * anyway when it is opened outside an iframe.
 * VI: Link tuyệt đối tới trang Flowie hiển thị tệp HTML được tải lên dưới header cảnh báo. Nút Mở
 * VI: tab mới và Copy link dùng link này thay cho URL preview thô, vốn cũng bị API chuyển về đây
 * VI: khi mở ngoài iframe.
 */
export const htmlPreviewPageUrl = (attachmentId: string) =>
   new URL(
      `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/preview/${encodeURIComponent(attachmentId)}`,
      window.location.origin
   ).toString();

/**
 * Runs an uploaded HTML file from the API preview route. The sandbox grants scripts and modal
 * dialogs only: without `allow-same-origin` the page is an opaque origin that cannot read Flowie
 * cookies or storage, call the API as the user, or reach this page; without `allow-top-navigation`,
 * `allow-popups` and `allow-forms` it cannot leave the frame, open windows or submit forms. These
 * flags match the API's CSP `sandbox` and were set by the DTD-547 security review: changing them
 * needs a new review. The iframe loads by URL (not `srcdoc`) so the request carries
 * `Sec-Fetch-Dest: iframe`, which the API requires before it serves the file.
 * VI: Chạy tệp HTML được tải lên từ route preview của API. Sandbox chỉ cấp script và hộp thoại
 * VI: modal: không có `allow-same-origin` nên trang là origin rỗng, không đọc được cookie hay storage
 * VI: của Flowie, không gọi API thay người dùng, không chạm tới trang này; không có
 * VI: `allow-top-navigation`, `allow-popups` và `allow-forms` nên không thoát khỏi khung, không mở cửa
 * VI: sổ, không submit form. Các cờ này khớp với CSP `sandbox` của API và do review bảo mật DTD-547
 * VI: chốt: đổi chúng phải review lại. Iframe tải bằng URL (không dùng `srcdoc`) để request mang
 * VI: `Sec-Fetch-Dest: iframe`, điều kiện API cần trước khi phục vụ tệp.
 */
export function SandboxedHtmlFrame({
   attachmentId,
   title,
   className,
}: {
   attachmentId: string;
   title: string;
   className?: string;
}) {
   return (
      <iframe
         sandbox="allow-scripts allow-modals"
         src={attachmentPreviewUrl(attachmentId)}
         title={title}
         className={className}
      />
   );
}
