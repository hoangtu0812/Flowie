'use client';
import { useState } from 'react';
import { CustomizeSidebarDialog } from '@/components/layout/sidebar/customize-sidebar-dialog';
import { Button } from '@astryxdesign/core/Button';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Selector } from '@astryxdesign/core/Selector';
import { DesignSurface } from '@/components/common/design-surface';
import {
   useUiPreferencesStore,
   type DefaultHome,
   type FontSize,
} from '@/store/ui-preferences-store';
import { useModifierKey } from '@/features/shared/use-modifier-key';
import { useLocale } from '@/features/shared/use-locale';
import { useMessages } from '@/features/shared/use-messages';
import { preferenceMessages } from './preference-messages';
import { TimePreferences } from './time-preferences';
import { ThemePreferences } from '@/components/common/settings/theme-preferences';
import { SettingsShell } from '@/components/common/settings/shared';

export default function AccountPreferencesPage() {
   const state = useUiPreferencesStore(),
      { t } = useLocale(),
      tx = useMessages(preferenceMessages),
      modifier = useModifierKey();
   const [customizeOpen, setCustomizeOpen] = useState(false);
   return (
      <DesignSurface>
         <SettingsShell
            title={t('preferences')}
            description={tx(
               'Preferences synchronize with your account. Theme and sidebar layout remain specific to this browser.'
            )}
         >
            <VStack as="main" gap={5} width="100%">
               <Text role="status">
                  {state.syncStatus === 'saved'
                     ? tx('Account preferences saved.')
                     : state.syncStatus === 'error'
                       ? tx('Preferences could not synchronize.')
                       : tx('Synchronizing account preferences…')}
               </Text>
               {state.syncError && (
                  <>
                     <Text role="alert">{state.syncError}</Text>
                     <Button
                        label={tx('Reload account preferences')}
                        onClick={state.reloadAccountPreferences}
                     />
                  </>
               )}
               {state.syncStatus !== 'loading' && (
                  <VStack gap={4} width="100%">
                     <Selector
                        label={tx('Language')}
                        value={state.locale}
                        options={[
                           { value: 'en', label: 'English' },
                           { value: 'vi', label: 'Tiếng Việt' },
                        ]}
                        onChange={(value) => state.setLocale(value === 'vi' ? 'vi' : 'en')}
                        width="100%"
                     />
                     <Selector
                        label={tx('Default home view')}
                        value={state.defaultHome}
                        options={[
                           { value: 'inbox', label: tx('Inbox') },
                           { value: 'my-issues', label: tx('My issues') },
                        ]}
                        onChange={(value) => state.setDefaultHome(value as DefaultHome)}
                        width="100%"
                     />
                     <Selector
                        label={tx('Comment submission shortcut')}
                        value={state.commentSubmitMode}
                        options={[
                           { value: 'modifier-enter', label: `${modifier}+Enter` },
                           { value: 'enter', label: tx('Enter (Shift+Enter for a new line)') },
                        ]}
                        onChange={(value) =>
                           state.setCommentSubmitMode(value as 'enter' | 'modifier-enter')
                        }
                        width="100%"
                     />
                     <TimePreferences />
                     <VStack gap={1} width="100%">
                        <CheckboxInput
                           label={tx('Automatically assign new tasks and bugs to me')}
                           value={state.autoAssignSelf}
                           onChange={state.setAutoAssignSelf}
                        />
                        <Text>
                           {tx(
                              'Applies to the create dialog when you are eligible in the selected team. You can clear or change the assignee before saving.'
                           )}
                        </Text>
                     </VStack>
                     <Selector
                        label={tx('Font size')}
                        value={state.fontSize}
                        options={[
                           { value: 'default', label: tx('Default') },
                           { value: 'small', label: tx('Small') },
                           { value: 'large', label: tx('Large') },
                        ]}
                        onChange={(value) => state.setFontSize(value as FontSize)}
                        width="100%"
                     />
                     <Button
                        label={tx('Customize sidebar')}
                        onClick={() => setCustomizeOpen(true)}
                     />
                     <CheckboxInput
                        label={tx('Use pointer cursors')}
                        value={state.pointerCursors}
                        onChange={state.setPointerCursors}
                     />
                     <CheckboxInput
                        label={tx('Underline links')}
                        value={state.underlineLinks}
                        onChange={state.setUnderlineLinks}
                     />
                  </VStack>
               )}
               <ThemePreferences />
               <Heading level={2}>{tx('Other preferences')}</Heading>
               <Text>
                  {tx(
                     'Display-name format, emoticon conversion and desktop deep links are not available yet.'
                  )}
               </Text>
               <CustomizeSidebarDialog open={customizeOpen} onOpenChange={setCustomizeOpen} />
            </VStack>
         </SettingsShell>
      </DesignSurface>
   );
}
