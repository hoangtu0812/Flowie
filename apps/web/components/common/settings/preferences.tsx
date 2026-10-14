'use client';
import { useState } from 'react';
import { CustomizeSidebarDialog } from '@/components/layout/sidebar/customize-sidebar-dialog';
import { Button } from '@astryxdesign/core/Button';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { List, ListItem } from '@astryxdesign/core/List';
import { DesignSurface } from '@/components/common/design-surface';
import { useUiPreferencesStore } from '@/store/ui-preferences-store';
import { useModifierKey } from '@/features/shared/use-modifier-key';
import { useLocale } from '@/features/shared/use-locale';
import { SelectMenu } from './shared';
import { ThemePreferences } from './theme-preferences';
export default function Preferences() {
   const state = useUiPreferencesStore();
   const { t } = useLocale();
   const modifier = useModifierKey();
   const [customizeOpen, setCustomizeOpen] = useState(false);
   return (
      <DesignSurface>
         <VStack as="main" padding={6} gap={6} maxWidth={800}>
            <Heading level={1}>{t('preferences')}</Heading>
            <Text>These preferences apply immediately and are saved in this browser.</Text>
            <List hasDividers>
               <ListItem
                  label={t('language')}
                  description="Authentication and shared messages. Other screens currently use English."
                  endContent={
                     <SelectMenu
                        label="Language"
                        options={['English', 'Tiếng Việt']}
                        value={state.locale === 'vi' ? 'Tiếng Việt' : 'English'}
                        onChange={(value) => state.setLocale(value === 'Tiếng Việt' ? 'vi' : 'en')}
                     />
                  }
               />
               <ListItem
                  label="Default home view"
                  endContent={
                     <SelectMenu
                        label="Default home view"
                        options={['Inbox', 'My issues']}
                        value={state.defaultHome === 'inbox' ? 'Inbox' : 'My issues'}
                        onChange={(value) =>
                           state.setDefaultHome(value === 'Inbox' ? 'inbox' : 'my-issues')
                        }
                     />
                  }
               />
               <ListItem
                  label="Send comments with"
                  endContent={
                     <SelectMenu
                        label="Comment submission shortcut"
                        options={[`${modifier}+Enter`, 'Enter (Shift+Enter for a new line)']}
                        value={
                           state.commentSubmitMode === 'enter'
                              ? 'Enter (Shift+Enter for a new line)'
                              : `${modifier}+Enter`
                        }
                        onChange={(value) =>
                           state.setCommentSubmitMode(
                              value.startsWith('Enter') ? 'enter' : 'modifier-enter'
                           )
                        }
                     />
                  }
               />
               <ListItem
                  label="Font size"
                  endContent={
                     <SelectMenu
                        label="Font size"
                        options={['Default', 'Small', 'Large']}
                        value={
                           { default: 'Default', small: 'Small', large: 'Large' }[state.fontSize]
                        }
                        onChange={(value) =>
                           state.setFontSize(
                              value === 'Small' ? 'small' : value === 'Large' ? 'large' : 'default'
                           )
                        }
                     />
                  }
               />
               <ListItem
                  label="App sidebar"
                  endContent={
                     <Button label="Customize sidebar" onClick={() => setCustomizeOpen(true)} />
                  }
               />
            </List>
            <CheckboxInput
               label="Use pointer cursors"
               value={state.pointerCursors}
               onChange={state.setPointerCursors}
            />
            <CheckboxInput
               label="Underline links"
               value={state.underlineLinks}
               onChange={state.setUnderlineLinks}
            />
            <ThemePreferences />
            <Heading level={2}>Unsupported preferences</Heading>
            <Text>
               Display-name format, week-start overrides, emoticon conversion, desktop deep links
               and automatic self-assignment are not implemented. No setting is saved for these
               features.
            </Text>
            <CustomizeSidebarDialog open={customizeOpen} onOpenChange={setCustomizeOpen} />
         </VStack>
      </DesignSurface>
   );
}
