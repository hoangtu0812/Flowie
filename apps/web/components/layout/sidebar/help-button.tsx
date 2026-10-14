'use client';
import { useEffect, useState } from 'react';
import { HelpCircle } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Button } from '@astryxdesign/core/Button';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { List, ListItem } from '@astryxdesign/core/List';
import { DesignSurface } from '@/components/common/design-surface';
import { useModifierKey } from '@/features/shared/use-modifier-key';
import { CHANGELOG_URL, releaseLabel } from '@/lib/release';
const TOPICS = [
   {
      title: 'Document editing and history',
      text: 'Done and Close wait for the latest save. Conflicts retain your draft; compare and reconcile before retrying. Revision history can restore reviewed content.',
      path: '/teams',
   },
   {
      title: 'Tasks and structured bugs',
      text: 'Choose Task or Bug when creating an issue. Bug fields include severity, environment and reproduction details. Issue filters support type/severity.',
      path: '/my-issues',
   },
   {
      title: 'AI client connection',
      text: 'Create a project grant in Integrations, copy the client configuration and set the token in your local environment. Verify discovery and scope before using real work.',
      path: '/settings/integrations',
   },
   {
      title: 'Comment collaboration',
      text: 'Reply to a top-level comment, select members to notify, edit your own comments and inspect revision history. Attachments are available on saved comments.',
      path: '/my-issues',
   },
   {
      title: 'Password recovery',
      text: 'Request a private email reset link. Recovery requires configured SMTP; a reset revokes old sessions and API/MCP tokens.',
      path: '/auth/forgot-password',
      global: true,
   },
   {
      title: 'Interface preferences',
      text: 'Choose locale, font size and comment submission keys. Preferences are stored in this browser.',
      path: '/settings/preferences',
   },
];
export function HelpButton() {
   const [open, setOpen] = useState(false);
   const [search, setSearch] = useState('');
   const { orgId } = useParams<{ orgId: string }>();
   const modifier = useModifierKey();
   useEffect(() => {
      const handler = (event: KeyboardEvent) => {
         if (
            (event.ctrlKey || event.metaKey) &&
            event.key === '/' &&
            !(
               event.target instanceof HTMLElement &&
               event.target.closest('input,textarea,[contenteditable=true]')
            )
         ) {
            event.preventDefault();
            setOpen((value) => !value);
         }
      };
      window.addEventListener('keydown', handler);
      return () => window.removeEventListener('keydown', handler);
   }, []);
   const topics = TOPICS.filter((topic) =>
      `${topic.title} ${topic.text}`.toLowerCase().includes(search.toLowerCase())
   );
   return (
      <DesignSurface>
         <Button
            label="Help and keyboard shortcuts"
            isIconOnly
            icon={<HelpCircle />}
            variant="ghost"
            onClick={() => setOpen(true)}
         />
         <Dialog isOpen={open} onOpenChange={setOpen} purpose="info" padding={4}>
            <VStack gap={4}>
               <DialogHeader title="Flowie help" onOpenChange={setOpen} />
               <TextInput label="Search help topics" value={search} onChange={setSearch} />
               <List hasDividers>
                  {topics.map((topic) => (
                     <ListItem
                        key={topic.title}
                        label={topic.title}
                        description={topic.text}
                        endContent={
                           <Button
                              label={`Open ${topic.title}`}
                              as={Link}
                              href={topic.global ? topic.path : `/${orgId}${topic.path}`}
                              onClick={() => setOpen(false)}
                           />
                        }
                     />
                  ))}
               </List>
               {!topics.length && <Text>No help topics match this search.</Text>}
               <Heading level={2}>Keyboard shortcuts</Heading>
               <List>
                  <ListItem label={`${modifier}+K`} description="Open the command palette" />
                  <ListItem label={`${modifier}+B`} description="Toggle the sidebar" />
                  <ListItem label={`${modifier}+/`} description="Open Help outside text inputs" />
                  <ListItem
                     label={`${modifier}+Enter`}
                     description="Save an issue description; submit comments with the default preference"
                  />
                  <ListItem
                     label="Shift+Enter"
                     description="Insert a new line with Enter comment submission enabled"
                  />
                  <ListItem
                     label="Escape"
                     description="Close a dialog or cancel description editing"
                  />
               </List>
               <Link href={CHANGELOG_URL} target="_blank" rel="noreferrer">
                  Flowie {releaseLabel()} · Changelog
               </Link>
               <Link
                  href="https://github.com/hoangtu0812/Flowie/issues"
                  target="_blank"
                  rel="noreferrer"
               >
                  Report an issue
               </Link>
            </VStack>
         </Dialog>
      </DesignSurface>
   );
}
