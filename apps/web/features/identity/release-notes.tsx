'use client';

import { ExternalLink } from 'lucide-react';
import { Button } from '@astryxdesign/core/Button';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { List, ListItem } from '@astryxdesign/core/List';
import { APP_RELEASE_NOTES, CHANGELOG_URL, noteText, releaseLabel } from '@/lib/release';
import type { Locale } from '@/features/shared/locale';

/**
 * Release notes of the running bundle: the version label, every changelog
 * bullet of that release and a link to the full history. Both the Help menu's
 * "What's new" view and the announcement dialog render this one component, so
 * the two can never show different notes for the same build.
 *
 * The notes come from CHANGELOG.md at build time, where every entry is written
 * in English with a Vietnamese line of the same meaning, so each bullet is
 * shown in the language the account reads. A build made outside the repository
 * carries no notes at all, which is why the empty case says so instead of
 * rendering an empty list.
 *
 * VI: Thông tin bản cập nhật của bundle đang chạy: nhãn phiên bản, mọi dòng
 * changelog của bản đó và liên kết tới lịch sử đầy đủ. Cả mục "Có gì mới" trong
 * menu Help và dialog thông báo đều dùng chung component này, nên hai nơi không
 * thể hiển thị nội dung khác nhau cho cùng một bản dựng.
 *
 * Nội dung lấy từ CHANGELOG.md lúc build, nơi mỗi mục được viết bằng tiếng Anh
 * kèm một dòng tiếng Việt cùng ý nghĩa, nên từng dòng hiển thị theo đúng ngôn
 * ngữ tài khoản đang đọc. Bản dựng tạo ngoài repository không có dòng nào, vì
 * vậy trường hợp rỗng nói rõ điều đó thay vì hiện một danh sách trống.
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
                  <ListItem key={note.en} label={<Text>{noteText(note, locale)}</Text>} />
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
