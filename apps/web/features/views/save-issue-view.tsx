'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { Button } from '@astryxdesign/core/Button';
import { DesignSurface } from '@/components/common/design-surface';
import { useIssuesStore } from '@/store/issues-store';
import { useMessages } from '@/features/shared/use-messages';
import { captureIssueView } from './config';
import { ViewEditor } from './view-editor';
import { messages } from './messages.vi';

export function SaveIssueView() {
   const pathname = usePathname();
   const state = useIssuesStore();
   const tx = useMessages(messages);
   const [open, setOpen] = useState(false);
   if (
      !/^\/[^/]+\/(issues(?:\/[^/]+)?|team\/[^/]+\/(?:all|active|backlog))\/?$/.test(pathname) ||
      !state.workspaceId ||
      !state.pageQuery ||
      state.error ||
      new URLSearchParams(state.pageQuery).has('scope')
   )
      return null;
   return (
      <DesignSurface>
         <Button
            label={tx('Save as view')}
            size="sm"
            variant="ghost"
            isDisabled={state.loading}
            onClick={() => setOpen(true)}
         />
         {open && (
            <ViewEditor
               workspaceId={state.workspaceId}
               config={captureIssueView(state.pageQuery)}
               onClose={() => setOpen(false)}
            />
         )}
      </DesignSurface>
   );
}
