'use client';

import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { VStack } from '@astryxdesign/core/Layout';
import { DesignSurface } from '@/components/common/design-surface';
import { useUiPreferencesStore } from '@/store/ui-preferences-store';
import { APP_VERSION, releaseAnnouncement } from '@/lib/release';
import { ReleaseNotes } from './release-notes';

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
 * `settled` makes the decision at most once per page load. Without it, the
 * write that records the version would feed back through the store and a failed
 * autosave could pop the dialog a second time while the person is working.
 * Writing is fire-and-forget: the shared autosave in PreferenceSync carries it,
 * and a write that fails only means the dialog returns on a later visit, which
 * is far better than blocking the person behind a modal that cannot be closed.
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
 * `settled` bảo đảm chỉ quyết định một lần cho mỗi lần tải trang. Không có nó,
 * lệnh ghi phiên bản sẽ dội lại qua store và một lần autosave lỗi có thể làm
 * dialog bật lên lần thứ hai giữa lúc người dùng đang làm việc. Việc ghi là
 * fire-and-forget: autosave dùng chung trong PreferenceSync lo phần gửi, và ghi
 * thất bại chỉ khiến dialog hiện lại ở lần truy cập sau, vẫn tốt hơn nhiều so
 * với việc chặn người dùng sau một modal không đóng được.
 */
export function ReleaseAnnouncement() {
   const locale = useUiPreferencesStore((state) => state.locale);
   const lastSeen = useUiPreferencesStore((state) => state.lastSeenReleaseVersion);
   const syncStatus = useUiPreferencesStore((state) => state.syncStatus);
   const setLastSeen = useUiPreferencesStore((state) => state.setLastSeenReleaseVersion);
   const [isOpen, setIsOpen] = useState(false);
   const settled = useRef(false);

   useEffect(() => {
      if (settled.current) return;
      const decision = releaseAnnouncement(APP_VERSION, lastSeen, syncStatus);
      if (decision === 'idle' || decision === 'wait') return;
      settled.current = true;
      if (decision === 'adopt') setLastSeen(APP_VERSION);
      else setIsOpen(true);
   }, [lastSeen, syncStatus, setLastSeen]);

   const copy = (en: string, vi: string) => (locale === 'vi' ? vi : en);
   const dismiss = () => {
      setIsOpen(false);
      setLastSeen(APP_VERSION);
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
