'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { VStack } from '@astryxdesign/core/Layout';
import { DesignSurface } from '@/components/common/design-surface';
import { useUiPreferencesStore } from '@/store/ui-preferences-store';
import { APP_VERSION, releaseAnnouncement } from '@/lib/release';
import { ReleaseNotes } from './release-notes';
import { recordSeenRelease } from './account-preferences';

/**
 * Tells the account, once, that Flowie reached a new release.
 *
 * What counts as "seen" is `lastSeenReleaseVersion` in the account's UI
 * preferences, which live on the server, so closing the dialog silences it on
 * every browser and device the person signs in from. The decision itself is
 * `releaseAnnouncement` in lib/release; this component only owns the effects.
 *
 * Mounted inside the workspace layout next to PreferenceSync, so it never runs
 * on sign-in or recovery screens, where there is no account to record against.
 *
 * `settled` makes the decision at most once per page load, so a write that
 * fails cannot pop the dialog a second time while the person is working.
 * Writing is fire-and-forget through recordSeenRelease, which sends its own
 * request rather than riding the shared preference autosave: this is
 * bookkeeping triggered by merely opening the app, and a failure of it must
 * leave both the person and the rest of the preference UI alone. The cost is
 * that the announcement returns on a later visit, which is far better than
 * blocking someone behind a modal or disabling controls they were using.
 *
 * VI: Thông báo cho tài khoản, đúng một lần, rằng Flowie đã lên bản mới.
 *
 * Trạng thái "đã xem" là khoá `lastSeenReleaseVersion` trong UI preferences của
 * tài khoản, lưu ở server, nên đóng dialog là tắt nó trên mọi trình duyệt và
 * thiết bị mà người dùng đăng nhập. Luật quyết định nằm ở `releaseAnnouncement`
 * trong lib/release; component này chỉ chịu trách nhiệm phần tác động.
 *
 * Component được mount trong layout workspace cạnh PreferenceSync, nên không
 * bao giờ chạy ở trang đăng nhập hay khôi phục mật khẩu, nơi chưa có tài khoản
 * để ghi nhận.
 *
 * `settled` bảo đảm chỉ quyết định một lần cho mỗi lần tải trang, nên một lệnh
 * ghi hỏng không thể làm dialog bật lên lần thứ hai giữa lúc người dùng đang
 * làm việc. Việc ghi là fire-and-forget qua recordSeenRelease, hàm này gửi
 * request riêng chứ không đi nhờ autosave preferences dùng chung: đây là ghi
 * chép nền chỉ do mở ứng dụng mà có, nên khi hỏng nó phải để yên cả người dùng
 * lẫn phần giao diện preferences còn lại. Cái giá là thông báo sẽ quay lại ở
 * lần truy cập sau, vẫn tốt hơn nhiều so với việc chặn người dùng sau một modal
 * hoặc khoá mất những control họ đang dùng.
 */
export function ReleaseAnnouncement() {
   const locale = useUiPreferencesStore((state) => state.locale);
   const lastSeen = useUiPreferencesStore((state) => state.lastSeenReleaseVersion);
   const syncStatus = useUiPreferencesStore((state) => state.syncStatus);
   const accountId = useUiPreferencesStore((state) => state.accountId);
   const [isOpen, setIsOpen] = useState(false);
   const settled = useRef(false);

   const record = useCallback(() => {
      if (accountId) void recordSeenRelease(accountId, APP_VERSION).catch(() => {});
   }, [accountId]);

   useEffect(() => {
      if (settled.current) return;
      const decision = releaseAnnouncement(APP_VERSION, lastSeen, syncStatus);
      if (decision === 'idle' || decision === 'wait') return;
      settled.current = true;
      if (decision === 'adopt') record();
      else setIsOpen(true);
   }, [lastSeen, syncStatus, record]);

   const copy = (en: string, vi: string) => (locale === 'vi' ? vi : en);
   const dismiss = () => {
      setIsOpen(false);
      record();
   };
   return (
      <DesignSurface>
         <Dialog
            isOpen={isOpen}
            onOpenChange={(value) => {
               if (!value) dismiss();
            }}
            purpose="info"
            padding={5}
            width={640}
         >
            <VStack gap={4} width="100%">
               <DialogHeader
                  title={copy("What's new in Flowie", 'Flowie có gì mới')}
                  subtitle={copy(
                     'Flowie was updated. Here is what changed in this release.',
                     'Flowie vừa được cập nhật. Dưới đây là những thay đổi của bản này.'
                  )}
                  onOpenChange={(value) => {
                     if (!value) dismiss();
                  }}
               />
               <ReleaseNotes locale={locale} />
            </VStack>
         </Dialog>
      </DesignSurface>
   );
}
