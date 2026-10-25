'use client';

import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { useSidebar } from '@/components/ui/sidebar';
import { BookOpen, ExternalLink, HelpCircle, Keyboard, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Button } from '@astryxdesign/core/Button';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { List, ListItem } from '@astryxdesign/core/List';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { Kbd } from '@astryxdesign/core/Kbd';
import { DesignSurface } from '@/components/common/design-surface';
import { Button as MenuButton } from '@/components/ui/button';
import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuLabel,
   DropdownMenuSeparator,
   DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useUiPreferencesStore } from '@/store/ui-preferences-store';
import { helpTopics, helpShortcuts } from '@/features/identity/help-content';
import { APP_HIGHLIGHTS, APP_RELEASE_NOTES, CHANGELOG_URL, releaseLabel } from '@/lib/release';

type HelpView = 'guide' | 'shortcuts' | 'updates';
const useHelpStore = create<{ view: HelpView | null; setView: (view: HelpView | null) => void }>(
   (set) => ({ view: null, setView: (view) => set({ view }) })
);

export function HelpButton() {
   const { view, setView } = useHelpStore();
   const [menuOpen, setMenuOpen] = useState(false);
   const { setOpenMobile } = useSidebar();
   const locale = useUiPreferencesStore((state) => state.locale);
   const copy = (en: string, vi: string) => (locale === 'vi' ? vi : en);
   const open = (next: HelpView) => {
      setMenuOpen(false);
      setOpenMobile(false);
      setView(next);
   };
   const updates = copy("What's new", 'Có gì mới');
   return (
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
         <DropdownMenuTrigger asChild>
            <MenuButton
               variant="ghost"
               className="w-full justify-start gap-2"
               aria-label={copy('Help and keyboard shortcuts', 'Trợ giúp và phím tắt')}
            >
               <HelpCircle className="size-4" />
               {copy('Help & feedback', 'Trợ giúp & phản hồi')}
            </MenuButton>
         </DropdownMenuTrigger>
         <DropdownMenuContent
            align="start"
            side="top"
            className="w-80 max-w-full"
            onCloseAutoFocus={(event) => {
               if (view) event.preventDefault();
            }}
         >
            <DropdownMenuItem onSelect={() => open('guide')}>
               <BookOpen className="size-4" />
               {copy('Feature guide', 'Hướng dẫn chức năng')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => open('shortcuts')}>
               <Keyboard className="size-4" />
               {copy('Keyboard shortcuts', 'Phím tắt')}
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
               <Link
                  href="https://github.com/hoangtu0812/Flowie/issues"
                  target="_blank"
                  rel="noreferrer"
               >
                  <ExternalLink className="size-4" />
                  {copy('Report an issue', 'Báo lỗi')}
               </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>{updates}</DropdownMenuLabel>
            <DesignSurface>
               <VStack gap={2} padding={2}>
                  {APP_HIGHLIGHTS.slice(0, 3).map((highlight) => (
                     <Text key={highlight} type="supporting" maxLines={2}>
                        {highlight}
                     </Text>
                  ))}
                  {!APP_HIGHLIGHTS.length && (
                     <Text type="supporting">
                        {copy(
                           'Release notes will appear here when available.',
                           'Nội dung bản cập nhật sẽ hiển thị khi có bản phát hành.'
                        )}
                     </Text>
                  )}
               </VStack>
            </DesignSurface>
            <DropdownMenuItem onSelect={() => open('updates')}>
               <Sparkles className="size-4" />
               {copy('Read release notes', 'Xem thông tin bản cập nhật')}
            </DropdownMenuItem>
            {releaseLabel() && (
               <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => open('updates')}>
                     {'Flowie ' + releaseLabel()}
                  </DropdownMenuItem>
               </>
            )}
         </DropdownMenuContent>
      </DropdownMenu>
   );
}

/** Keep the dialog and shortcut mounted when mobile navigation is closed. */
export function HelpCenter() {
   const { view, setView } = useHelpStore();
   const [search, setSearch] = useState('');
   const { orgId } = useParams<{ orgId: string }>();
   const locale = useUiPreferencesStore((state) => state.locale);
   const copy = (en: string, vi: string) => (locale === 'vi' ? vi : en);
   const open = (next: HelpView) => {
      setSearch('');
      setView(next);
   };
   useEffect(() => {
      const handler = (event: KeyboardEvent) => {
         if (
            (event.ctrlKey || event.metaKey) &&
            event.key === '/' &&
            !event.repeat &&
            !(
               event.target instanceof HTMLElement &&
               event.target.closest('input,textarea,[contenteditable=true]')
            )
         ) {
            event.preventDefault();
            setSearch('');
            setView(useHelpStore.getState().view ? null : 'guide');
         }
      };
      window.addEventListener('keydown', handler);
      return () => {
         window.removeEventListener('keydown', handler);
         setView(null);
      };
   }, [setView]);
   useEffect(() => {
      if (!view) setSearch('');
   }, [view]);
   const normalize = (value: string) =>
      value
         .toLowerCase()
         .normalize('NFD')
         .replace(/[\u0300-\u036f]/g, '')
         .replace(/đ/g, 'd');
   const topics = helpTopics.filter((topic) =>
      normalize([...topic.title, ...topic.meaning, ...topic.steps].join(' ')).includes(
         normalize(search.trim())
      )
   );
   const title = copy('Flowie help', 'Trợ giúp Flowie');
   const updates = copy("What's new", 'Có gì mới');
   return (
      <DesignSurface>
         <Dialog
            isOpen={view !== null}
            onOpenChange={(value) => {
               if (!value) setView(null);
            }}
            purpose="info"
            padding={5}
            width={800}
         >
            <VStack gap={4} width="100%">
               <DialogHeader
                  title={title}
                  onOpenChange={(value) => {
                     if (!value) setView(null);
                  }}
               />
               <HStack gap={2} wrap="wrap" aria-label={title}>
                  {(
                     [
                        [
                           'guide',
                           copy('Feature guide', 'Hướng dẫn chức năng'),
                           <BookOpen key="guide" />,
                        ],
                        [
                           'shortcuts',
                           copy('Keyboard shortcuts', 'Phím tắt'),
                           <Keyboard key="shortcuts" />,
                        ],
                        ['updates', updates, <Sparkles key="updates" />],
                     ] as const
                  ).map(([key, label, icon]) => (
                     <Button
                        key={key}
                        label={label}
                        icon={icon}
                        variant={view === key ? 'secondary' : 'ghost'}
                        aria-pressed={view === key}
                        onClick={() => open(key)}
                     />
                  ))}
               </HStack>
               {view === 'guide' && (
                  <VStack gap={3}>
                     <Text color="secondary">
                        {copy(
                           'Learn what each feature does and how to use it. Expand a topic to get started.',
                           'Tìm hiểu ý nghĩa và cách sử dụng từng chức năng. Mở một chủ đề để bắt đầu.'
                        )}
                     </Text>
                     <TextInput
                        label={copy('Search help topics', 'Tìm hướng dẫn')}
                        value={search}
                        onChange={setSearch}
                        hasClear
                        width="100%"
                     />
                     {topics.map((topic) => (
                        <Collapsible
                           key={topic.id + ':' + Boolean(search.trim())}
                           trigger={copy(...topic.title)}
                           defaultIsOpen={Boolean(search.trim())}
                        >
                           <VStack gap={3} paddingBlock={2}>
                              <Text weight="semibold">{copy(...topic.meaning)}</Text>
                              <Text color="secondary">{copy(...topic.steps)}</Text>
                              <HStack>
                                 <Button
                                    label={copy('Open feature', 'Mở chức năng')}
                                    as={Link}
                                    href={'/' + orgId + topic.path}
                                    onClick={() => setView(null)}
                                 />
                              </HStack>
                           </VStack>
                        </Collapsible>
                     ))}
                     {!topics.length && (
                        <Text role="status">
                           {copy(
                              'No help topics match this search.',
                              'Không tìm thấy hướng dẫn phù hợp.'
                           )}
                        </Text>
                     )}
                  </VStack>
               )}
               {view === 'shortcuts' && (
                  <VStack gap={3}>
                     <Text color="secondary">
                        {copy(
                           'Shortcuts apply in the contexts below. Use ⌘ on Mac and Ctrl on Windows or Linux.',
                           'Phím tắt áp dụng trong ngữ cảnh dưới đây. Dùng ⌘ trên Mac và Ctrl trên Windows hoặc Linux.'
                        )}
                     </Text>
                     <List
                        hasDividers
                        header={
                           <Heading level={2}>{copy('Keyboard shortcuts', 'Phím tắt')}</Heading>
                        }
                     >
                        {helpShortcuts.map((shortcut) => (
                           <ListItem
                              key={shortcut.keys}
                              label={copy(...shortcut.title)}
                              description={
                                 <Text color="secondary">{copy(...shortcut.context)}</Text>
                              }
                              endContent={<Kbd keys={shortcut.keys} />}
                           />
                        ))}
                     </List>
                  </VStack>
               )}
               {view === 'updates' && (
                  <VStack gap={4}>
                     <VStack gap={1}>
                        <Heading level={2}>{updates}</Heading>
                        {releaseLabel() && (
                           <Text color="secondary">{'Flowie ' + releaseLabel()}</Text>
                        )}
                     </VStack>
                     {APP_RELEASE_NOTES.length ? (
                        <List listStyle="disc" hasDividers>
                           {APP_RELEASE_NOTES.map((highlight) => (
                              <ListItem key={highlight} label={<Text>{highlight}</Text>} />
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
               )}
            </VStack>
         </Dialog>
      </DesignSurface>
   );
}
