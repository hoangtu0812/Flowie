'use client';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { CustomizeSidebarDialog } from '@/components/layout/sidebar/customize-sidebar-dialog';
import { Button } from '@astryxdesign/core/Button';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
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
import { PREFERENCE_CONTROL_WIDTH, TimePreferences } from './time-preferences';
import { ThemePreferences } from '@/components/common/settings/theme-preferences';
import {
   SettingsCard,
   SettingsRow,
   SettingsSection,
   SettingsShell,
} from '@/components/common/settings/shared';

export default function AccountPreferencesPage() {
   const state = useUiPreferencesStore(),
      { t } = useLocale(),
      tx = useMessages(preferenceMessages),
      modifier = useModifierKey();
   const [customizeOpen, setCustomizeOpen] = useState(false);
   const previousStatus = useRef(state.syncStatus);
   // Confirms a finished autosave with a short toast instead of a permanent status line; the
   // initial load (loading → saved) stays silent because nothing was changed by the user.
   // VI: Báo autosave xong bằng toast ngắn thay cho dòng trạng thái hiện mãi; lần tải đầu
   // (loading → saved) không báo vì người dùng chưa đổi gì.
   useEffect(() => {
      if (previousStatus.current === 'saving' && state.syncStatus === 'saved')
         toast.success(tx('Account preferences saved.'), { id: 'account-preferences-saved' });
      previousStatus.current = state.syncStatus;
   }, [state.syncStatus, tx]);
   return (
      <DesignSurface>
         <SettingsShell
            title={t('preferences')}
            description={tx(
               'Preferences synchronize with your account. Theme and sidebar layout remain specific to this browser.'
            )}
            action={
               <span role="status" className="text-xs text-muted-foreground shrink-0">
                  {state.syncStatus === 'loading'
                     ? tx('Synchronizing account preferences…')
                     : state.syncStatus === 'error'
                       ? tx('Preferences could not synchronize.')
                       : null}
               </span>
            }
         >
            {state.syncError && (
               <SettingsCard>
                  <SettingsRow
                     title={<span role="alert">{state.syncError}</span>}
                     trailing={
                        <Button
                           label={tx('Reload account preferences')}
                           size="sm"
                           variant="secondary"
                           onClick={state.reloadAccountPreferences}
                        />
                     }
                  />
               </SettingsCard>
            )}
            {state.syncStatus !== 'loading' && (
               <>
                  <SettingsSection title={tx('General')}>
                     <SettingsCard>
                        <SettingsRow
                           title={tx('Language')}
                           trailing={
                              <Selector
                                 label={tx('Language')}
                                 isLabelHidden
                                 size="sm"
                                 width={PREFERENCE_CONTROL_WIDTH}
                                 value={state.locale}
                                 options={[
                                    { value: 'en', label: 'English' },
                                    { value: 'vi', label: 'Tiếng Việt' },
                                 ]}
                                 onChange={(value) => state.setLocale(value === 'vi' ? 'vi' : 'en')}
                              />
                           }
                        />
                        <SettingsRow
                           title={tx('Default home view')}
                           trailing={
                              <Selector
                                 label={tx('Default home view')}
                                 isLabelHidden
                                 size="sm"
                                 width={PREFERENCE_CONTROL_WIDTH}
                                 value={state.defaultHome}
                                 options={[
                                    { value: 'inbox', label: tx('Inbox') },
                                    { value: 'my-issues', label: tx('My issues') },
                                 ]}
                                 onChange={(value) => state.setDefaultHome(value as DefaultHome)}
                              />
                           }
                        />
                        <SettingsRow
                           title={tx('Comment submission shortcut')}
                           trailing={
                              <Selector
                                 label={tx('Comment submission shortcut')}
                                 isLabelHidden
                                 size="sm"
                                 width={PREFERENCE_CONTROL_WIDTH}
                                 value={state.commentSubmitMode}
                                 options={[
                                    { value: 'modifier-enter', label: `${modifier}+Enter` },
                                    {
                                       value: 'enter',
                                       label: tx('Enter (Shift+Enter for a new line)'),
                                    },
                                 ]}
                                 onChange={(value) =>
                                    state.setCommentSubmitMode(value as 'enter' | 'modifier-enter')
                                 }
                              />
                           }
                        />
                        <SettingsRow
                           title={tx('Automatically assign new tasks and bugs to me')}
                           description={tx(
                              'Applies to the create dialog when you are eligible in the selected team. You can clear or change the assignee before saving.'
                           )}
                           trailing={
                              <CheckboxInput
                                 label={tx('Automatically assign new tasks and bugs to me')}
                                 isLabelHidden
                                 value={state.autoAssignSelf}
                                 onChange={state.setAutoAssignSelf}
                              />
                           }
                        />
                     </SettingsCard>
                  </SettingsSection>
                  <TimePreferences />
                  <SettingsSection title={tx('Display')}>
                     <SettingsCard>
                        <SettingsRow
                           title={tx('Font size')}
                           trailing={
                              <Selector
                                 label={tx('Font size')}
                                 isLabelHidden
                                 size="sm"
                                 width={PREFERENCE_CONTROL_WIDTH}
                                 value={state.fontSize}
                                 options={[
                                    { value: 'default', label: tx('Default') },
                                    { value: 'small', label: tx('Small') },
                                    { value: 'large', label: tx('Large') },
                                 ]}
                                 onChange={(value) => state.setFontSize(value as FontSize)}
                              />
                           }
                        />
                        <SettingsRow
                           title={tx('Use pointer cursors')}
                           trailing={
                              <CheckboxInput
                                 label={tx('Use pointer cursors')}
                                 isLabelHidden
                                 value={state.pointerCursors}
                                 onChange={state.setPointerCursors}
                              />
                           }
                        />
                        <SettingsRow
                           title={tx('Underline links')}
                           trailing={
                              <CheckboxInput
                                 label={tx('Underline links')}
                                 isLabelHidden
                                 value={state.underlineLinks}
                                 onChange={state.setUnderlineLinks}
                              />
                           }
                        />
                        <SettingsRow
                           title={tx('Customize sidebar')}
                           chevron
                           onClick={() => setCustomizeOpen(true)}
                        />
                     </SettingsCard>
                  </SettingsSection>
               </>
            )}
            <SettingsSection title={tx('Theme')}>
               <ThemePreferences />
            </SettingsSection>
            <p className="text-xs text-muted-foreground">
               {tx(
                  'Display-name format, emoticon conversion and desktop deep links are not available yet.'
               )}
            </p>
            <CustomizeSidebarDialog open={customizeOpen} onOpenChange={setCustomizeOpen} />
         </SettingsShell>
      </DesignSurface>
   );
}
