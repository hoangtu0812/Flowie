'use client';
import { useEffect, useState } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { Selector } from '@astryxdesign/core/Selector';
import { TextInput } from '@astryxdesign/core/TextInput';
import { useUiPreferencesStore } from '@/store/ui-preferences-store';
import { useMessages } from '@/features/shared/use-messages';
import { resolvedTimezone } from '@/features/shared/account-time';
import { SettingsCard, SettingsRow, SettingsSection } from '@/features/settings/shared';
import { preferenceMessages } from './preference-messages';

/**
 * Width of every trailing select or input on the Preferences page, so the controls line up.
 * VI: Độ rộng chung của mọi select/ô nhập bên phải trang Preferences để các control thẳng hàng.
 */
export const PREFERENCE_CONTROL_WIDTH = 200;

export function TimePreferences() {
   const state = useUiPreferencesStore(),
      tx = useMessages(preferenceMessages);
   const [zone, setZone] = useState(state.timezone ?? ''),
      [error, setError] = useState(false);
   useEffect(() => {
      setZone(state.timezone ?? '');
      setError(false);
   }, [state.timezone]);
   return (
      <SettingsSection title={tx('Time')}>
         <SettingsCard>
            <SettingsRow
               title={tx('Week starts on')}
               trailing={
                  <Selector
                     label={tx('Week starts on')}
                     isLabelHidden
                     size="sm"
                     width={PREFERENCE_CONTROL_WIDTH}
                     value={String(state.weekStart)}
                     options={[
                        { value: '1', label: tx('Monday') },
                        { value: '0', label: tx('Sunday') },
                        { value: '6', label: tx('Saturday') },
                     ]}
                     onChange={(value) => state.setWeekStart(Number(value) as 0 | 1 | 6)}
                  />
               }
            />
            {/* The input and two buttons are too wide for one phone-width row, so this row wraps
                its controls under the label instead of using the fixed SettingsRow layout.
                VI: Ô nhập và hai nút quá rộng cho một hàng ở màn hình điện thoại, nên hàng này
                cho control xuống dòng dưới nhãn thay vì dùng bố cục cố định của SettingsRow. */}
            <div className="flex flex-wrap items-center gap-3 px-4 py-3">
               <div className="flex-1 min-w-48">
                  <div className="text-sm font-medium">{tx('Account timezone')}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                     {tx('Use an IANA name such as Asia/Ho_Chi_Minh.')}{' '}
                     {tx('Current timezone: {zone}', { zone: resolvedTimezone(state.timezone) })}
                  </div>
                  {error && (
                     <div role="alert" className="text-xs text-destructive mt-0.5">
                        {tx('Enter a recognized IANA timezone.')}
                     </div>
                  )}
               </div>
               <div className="flex flex-wrap items-center gap-2">
                  <TextInput
                     label={tx('Account timezone')}
                     isLabelHidden
                     size="sm"
                     width={PREFERENCE_CONTROL_WIDTH}
                     placeholder="Asia/Ho_Chi_Minh"
                     value={zone}
                     onChange={(value) => {
                        setZone(value);
                        setError(false);
                     }}
                  />
                  <Button
                     label={tx('Apply timezone')}
                     size="sm"
                     variant="secondary"
                     onClick={() => {
                        try {
                           const value = zone.trim();
                           new Intl.DateTimeFormat('en', { timeZone: value }).format();
                           state.setTimezone(value === 'Asia/Saigon' ? 'Asia/Ho_Chi_Minh' : value);
                        } catch {
                           setError(true);
                        }
                     }}
                  />
                  <Button
                     label={tx('Use browser timezone')}
                     size="sm"
                     variant="ghost"
                     onClick={() => {
                        state.setTimezone(null);
                        setZone('');
                        setError(false);
                     }}
                  />
               </div>
            </div>
         </SettingsCard>
      </SettingsSection>
   );
}
