'use client';

import { ExternalLink } from 'lucide-react';
import { Button } from '@astryxdesign/core/Button';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { List, ListItem } from '@astryxdesign/core/List';
import { APP_RELEASE_NOTES, CHANGELOG_URL, releaseLabel } from '@/lib/release';
import type { Locale } from '@/features/shared/locale';

/**
 * Release notes of the running bundle: the version label, every changelog
 * bullet of that release and a link to the full history. Both the Help menu's
 * "What's new" view and the announcement dialog render this one component, so
 * the two can never show different notes for the same build.
 *
 * The notes come from CHANGELOG.md at build time, so each bullet is the
 * changelog's own English sentence and is not translated; only the surrounding
 * labels follow the account's locale. A build made outside the repository
 * carries no notes at all, which is why the empty case says so instead of
 * rendering an empty list.
 *
 * VI: Thông tin bản cập nhật của bundle đang chạy: nhãn phiên bản, mọi dòng
 * changelog của bản đó và liên kết tới lịch sử đầy đủ. Cả mục "Có gì mới" trong
 * menu Help và dialog thông báo đều dùng chung component này, nên hai nơi không
 * thể hiển thị nội dung khác nhau cho cùng một bản dựng.
 *
 * Nội dung lấy từ CHANGELOG.md lúc build, nên từng dòng là nguyên văn câu tiếng
 * Anh trong changelog và không được dịch; chỉ các nhãn xung quanh đi theo ngôn
 * ngữ của tài khoản. Bản dựng tạo ngoài repository không có dòng nào, vì vậy
 * trường hợp rỗng nói rõ điều đó thay vì hiện một danh sách trống.
 */
export function ReleaseNotes({ locale, heading }: { locale: Locale; heading?: string }) {
   const copy = (en: string, vi: string) => (locale === 'vi' ? vi : en);
   return (
      <VStack gap={4}>
         <VStack gap={1}>
            {heading ? <Heading level={2}>{heading}</Heading> : null}
            {releaseLabel() ? <Text color="secondary">{'Flowie ' + releaseLabel()}</Text> : null}
         </VStack>
         {APP_RELEASE_NOTES.length ? (
            <List listStyle="disc" hasDividers>
               {APP_RELEASE_NOTES.map((note) => (
                  <ListItem key={note} label={<Text>{note}</Text>} />
               ))}
            </List>
         ) : (
            <Text>
               {copy(
                  'No release notes are included in this build.',
                  'Bản dựng này chưa có thông tin phát hành.'
               )}
            </Text>
         )}
         <HStack>
            <Button
               label={copy('Full changelog', 'Lịch sử cập nhật đầy đủ')}
               icon={<ExternalLink />}
               href={CHANGELOG_URL}
               target="_blank"
               rel="noreferrer"
            />
         </HStack>
      </VStack>
   );
}
