'use client';

import { useState, useSyncExternalStore } from 'react';
import { Popover } from '@astryxdesign/core/Popover';
import { Selector } from '@astryxdesign/core/Selector';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { Button } from '@astryxdesign/core/Button';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { Settings2 } from 'lucide-react';
import { useMessages } from '@/features/shared/use-messages';
import {
   defaultMermaidPreferences,
   readMermaidPreferences,
   mermaidThemes,
   mermaidCurves,
   type MermaidPreferences,
} from '@/lib/mermaid-preferences';

const key = 'flowie:mermaid-preferences:v1';
const event = 'flowie:mermaid-preferences';
let snapshot = defaultMermaidPreferences;
let lastRaw: string | null | undefined;
function getSnapshot() {
   try {
      const raw = localStorage.getItem(key);
      if (raw !== lastRaw) {
         lastRaw = raw;
         snapshot = readMermaidPreferences(raw);
      }
   } catch {
      /* Retain session preferences if browser storage is unavailable.
                VI: Giữ tùy chọn trong phiên nếu không truy cập được lưu trữ trình duyệt. */
   }
   return snapshot;
}
function subscribe(listener: () => void) {
   window.addEventListener(event, listener);
   window.addEventListener('storage', listener);
   return () => {
      window.removeEventListener(event, listener);
      window.removeEventListener('storage', listener);
   };
}
function save(value: MermaidPreferences, reset = false) {
   snapshot = value;
   try {
      if (reset) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(value));
      lastRaw = localStorage.getItem(key);
   } catch {
      /* Keep the applied selection in memory when storage is denied/full.
                VI: Giữ lựa chọn đã áp dụng trong bộ nhớ khi lưu trữ bị chặn/đầy. */
   }
   window.dispatchEvent(new Event(event));
}
export function useMermaidPreferences() {
   return useSyncExternalStore(subscribe, getSnapshot, () => defaultMermaidPreferences);
}
export function MermaidSettings({ busy }: { busy: boolean }) {
   const applied = useMermaidPreferences();
   const [draft, setDraft] = useState(applied);
   const [open, setOpen] = useState(false);
   const tx = useMessages({
      'Mermaid Settings': 'Tùy chọn Mermaid',
      'Theme': 'Chủ đề',
      'Curve': 'Đường nối',
      'Use document': 'Theo tài liệu',
      'Custom background': 'Nền tùy chỉnh',
      'Background color': 'Màu nền',
      'White': 'Trắng',
      'Transparent': 'Trong suốt',
      'Black': 'Đen',
      'Apply': 'Áp dụng',
      'Reset': 'Đặt lại',
      'Applies across the web app in this browser. Does not change Markdown.':
         'Áp dụng toàn web app trong trình duyệt này. Không đổi Markdown.',
   });
   const documentOption = { value: 'document', label: tx('Use document') };
   return (
      <Popover
         isOpen={open}
         onOpenChange={(value) => {
            if (value) setDraft(applied);
            setOpen(value);
         }}
         label={tx('Mermaid Settings')}
         content={
            <VStack gap={3} className="p-4 w-72 max-w-full">
               <Text type="label">{tx('Mermaid Settings')}</Text>
               <Selector
                  label={tx('Theme')}
                  value={draft.theme}
                  options={[documentOption, ...mermaidThemes]}
                  onChange={(value) =>
                     setDraft({ ...draft, theme: value as MermaidPreferences['theme'] })
                  }
               />
               <Selector
                  label={tx('Curve')}
                  value={draft.curve}
                  options={[documentOption, ...mermaidCurves]}
                  onChange={(value) =>
                     setDraft({ ...draft, curve: value as MermaidPreferences['curve'] })
                  }
               />
               <CheckboxInput
                  label={tx('Custom background')}
                  value={draft.customBackground}
                  onChange={(value) => setDraft({ ...draft, customBackground: value })}
               />
               <Selector
                  label={tx('Background color')}
                  value={draft.background}
                  isDisabled={!draft.customBackground}
                  options={[
                     { value: 'white', label: tx('White') },
                     { value: 'transparent', label: tx('Transparent') },
                     { value: 'black', label: tx('Black') },
                  ]}
                  onChange={(value) =>
                     setDraft({ ...draft, background: value as MermaidPreferences['background'] })
                  }
               />
               <Text type="supporting">
                  {tx('Applies across the web app in this browser. Does not change Markdown.')}
               </Text>
               <HStack gap={2}>
                  <Button
                     label={tx('Apply')}
                     isDisabled={busy || JSON.stringify(draft) === JSON.stringify(applied)}
                     onClick={() => {
                        save(draft);
                        setOpen(false);
                     }}
                  />
                  <Button
                     label={tx('Reset')}
                     isDisabled={busy}
                     onClick={() => {
                        save(defaultMermaidPreferences, true);
                        setDraft(defaultMermaidPreferences);
                        setOpen(false);
                     }}
                  />
               </HStack>
            </VStack>
         }
      >
         <Button size="sm" icon={<Settings2 />} label={tx('Mermaid Settings')} />
      </Popover>
   );
}
