'use client';

import { Button } from '@/components/ui/button';
import { Bell } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { SettingsCard, SettingsRow, SettingsSection, SettingsShell } from './shared';

/** Personal accounts are intentionally separate from workspace Discord delivery. */
export default function AccountConnections() {
   const { orgId } = useParams<{ orgId: string }>();

   return (
      <SettingsShell
         title="Connected accounts"
         description="External account connections are not enabled in this Flowie workspace."
      >
         <SettingsSection title="Workspace notifications">
            <SettingsCard>
               <SettingsRow
                  icon={<Bell className="size-4" />}
                  title="Discord"
                  description="Configure the workspace Discord webhook for Flowie notifications."
                  trailing={
                     <Button size="xs" variant="secondary" asChild>
                        <Link href={`/${orgId}/settings/integrations`}>Configure</Link>
                     </Button>
                  }
               />
            </SettingsCard>
         </SettingsSection>
      </SettingsShell>
   );
}
