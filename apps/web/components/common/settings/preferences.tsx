'use client';

import { CustomizeSidebarDialog } from '@/components/layout/sidebar/customize-sidebar-dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useUiPreferencesStore } from '@/store/ui-preferences-store';
import { useState } from 'react';
import { SelectMenu, SettingsCard, SettingsRow, SettingsSection, SettingsShell } from './shared';
import { ThemePreferences } from './theme-preferences';

/** Personal "Preferences" settings (general, theme, automations). */
export default function Preferences() {
   const [customizeOpen, setCustomizeOpen] = useState(false);
   const {
      defaultHome,
      fontSize,
      pointerCursors,
      underlineLinks,
      setDefaultHome,
      setFontSize,
      setPointerCursors,
      setUnderlineLinks,
   } = useUiPreferencesStore();
   return (
      <SettingsShell title="Preferences">
         <SettingsSection title="General">
            <SettingsCard>
               <SettingsRow
                  title="Default home view"
                  description="Select which view to display when launching the app"
                  trailing={
                     <SelectMenu
                        options={['Agent', 'Inbox', 'My issues']}
                        value={
                           defaultHome === 'my-issues'
                              ? 'My issues'
                              : defaultHome[0].toUpperCase() + defaultHome.slice(1)
                        }
                        onChange={(value) =>
                           setDefaultHome(
                              value === 'Inbox'
                                 ? 'inbox'
                                 : value === 'My issues'
                                   ? 'my-issues'
                                   : 'agent'
                           )
                        }
                     />
                  }
               />
               <SettingsRow
                  title="Display names"
                  description="Display-name formatting is not configurable yet"
                  trailing={<span className="text-xs text-muted-foreground">Unavailable</span>}
                  muted
               />
               <SettingsRow
                  title="First day of the week"
                  description="Date-picker week settings are not configurable yet"
                  trailing={<span className="text-xs text-muted-foreground">Unavailable</span>}
                  muted
               />
               <SettingsRow
                  title="Convert text emoticons into emojis"
                  description="Comment text transformations are not available yet"
                  trailing={<Switch checked={false} disabled />}
                  muted
               />
               <SettingsRow
                  title="Send comments on..."
                  description="Comment keyboard shortcuts are not configurable yet"
                  trailing={<span className="text-xs text-muted-foreground">Unavailable</span>}
                  muted
               />
            </SettingsCard>
         </SettingsSection>

         <SettingsSection title="Interface and theme">
            <SettingsCard>
               <SettingsRow
                  title="App sidebar"
                  description="Customize sidebar item visibility, ordering, and badge style"
                  trailing={
                     <Button size="xs" variant="ghost" onClick={() => setCustomizeOpen(true)}>
                        Customize
                     </Button>
                  }
               />
               <SettingsRow
                  title="Font size"
                  description="Adjust the size of text across the app"
                  trailing={
                     <SelectMenu
                        options={['Default', 'Small', 'Large']}
                        value={fontSize[0].toUpperCase() + fontSize.slice(1)}
                        onChange={(value) => setFontSize(value.toLowerCase() as typeof fontSize)}
                     />
                  }
               />
               <SettingsRow
                  title="Use pointer cursors"
                  description="Change the cursor to a pointer when hovering over any interactive elements"
                  trailing={<Switch checked={pointerCursors} onCheckedChange={setPointerCursors} />}
               />
               <SettingsRow
                  title="Underline links"
                  description="Always underline links in text content"
                  trailing={<Switch checked={underlineLinks} onCheckedChange={setUnderlineLinks} />}
               />
            </SettingsCard>
            <ThemePreferences />
         </SettingsSection>

         <SettingsSection title="Desktop application">
            <SettingsCard>
               <SettingsRow
                  title="Open in desktop app"
                  description="The desktop application is not available"
                  trailing={<Switch checked={false} disabled />}
                  muted
               />
            </SettingsCard>
         </SettingsSection>

         <SettingsSection title="Automations and workflows">
            <SettingsCard>
               <SettingsRow
                  title="Auto-assign to self"
                  description="Issue automation is not available yet"
                  trailing={<Switch checked={false} disabled />}
                  muted
               />
               <SettingsRow
                  title="On move to started status, assign to yourself"
                  description="Issue automation is not available yet"
                  trailing={<Switch checked={false} disabled />}
                  muted
               />
            </SettingsCard>
         </SettingsSection>
         <CustomizeSidebarDialog open={customizeOpen} onOpenChange={setCustomizeOpen} />
      </SettingsShell>
   );
}
