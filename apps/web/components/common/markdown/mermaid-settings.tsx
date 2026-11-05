'use client';

import { useId, useState, useSyncExternalStore } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { IconButton } from '@astryxdesign/core/IconButton';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { Settings2, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
   Select,
   SelectContent,
   SelectItem,
   SelectTrigger,
   SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
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

function PreferenceSelect({
   label,
   value,
   options,
   disabled,
   onChange,
}: {
   label: string;
   value: string;
   options: readonly { value: string; label: string }[];
   disabled?: boolean;
   onChange: (value: string) => void;
}) {
   const id = useId();
   return (
      <VStack gap={2}>
         <Label htmlFor={id}>{label}</Label>
         <Select value={value} onValueChange={onChange} disabled={disabled}>
            <SelectTrigger id={id} aria-label={label} className="h-8 text-xs">
               <SelectValue />
            </SelectTrigger>
            <SelectContent>
               {options.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                     {option.label}
                  </SelectItem>
               ))}
            </SelectContent>
         </Select>
      </VStack>
   );
}

export function MermaidSettings({ busy }: { busy: boolean }) {
   const applied = useMermaidPreferences();
   const [draft, setDraft] = useState(applied);
   const [open, setOpen] = useState(false);
   const backgroundId = useId();
   const titleId = useId();
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
      'Close settings': 'Đóng tùy chọn',
      'Applies across the web app in this browser. Does not change Markdown.':
         'Áp dụng toàn web app trong trình duyệt này. Không đổi Markdown.',
   });
   const documentOption = { value: 'document', label: tx('Use document') };
   return (
      <Popover
         open={open}
         onOpenChange={(value) => {
            if (value) setDraft(applied);
            setOpen(value);
         }}
      >
         <PopoverTrigger asChild>
            <Button size="sm" icon={<Settings2 />} label={tx('Mermaid Settings')} />
         </PopoverTrigger>
         <PopoverContent align="start" aria-labelledby={titleId} className="w-72 max-w-full">
            <VStack gap={4}>
               <HStack gap={2} align="center" justify="between">
                  <Text id={titleId} type="label">
                     {tx('Mermaid Settings')}
                  </Text>
                  <IconButton
                     size="sm"
                     variant="ghost"
                     label={tx('Close settings')}
                     tooltip={tx('Close settings')}
                     icon={<X />}
                     onClick={() => setOpen(false)}
                  />
               </HStack>
               <PreferenceSelect
                  label={tx('Theme')}
                  value={draft.theme}
                  options={[
                     documentOption,
                     ...mermaidThemes.map((value) => ({ value, label: value })),
                  ]}
                  onChange={(value) =>
                     setDraft({ ...draft, theme: value as MermaidPreferences['theme'] })
                  }
               />
               <PreferenceSelect
                  label={tx('Curve')}
                  value={draft.curve}
                  options={[
                     documentOption,
                     ...mermaidCurves.map((value) => ({ value, label: value })),
                  ]}
                  onChange={(value) =>
                     setDraft({ ...draft, curve: value as MermaidPreferences['curve'] })
                  }
               />
               <HStack gap={2} align="center">
                  <Checkbox
                     id={backgroundId}
                     checked={draft.customBackground}
                     onCheckedChange={(value) =>
                        setDraft({ ...draft, customBackground: value === true })
                     }
                  />
                  <Label htmlFor={backgroundId}>{tx('Custom background')}</Label>
               </HStack>
               <PreferenceSelect
                  label={tx('Background color')}
                  value={draft.background}
                  disabled={!draft.customBackground}
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
               <HStack gap={2} justify="end" className="border-t border-border pt-3">
                  <Button
                     label={tx('Apply')}
                     size="sm"
                     variant="primary"
                     isDisabled={busy || JSON.stringify(draft) === JSON.stringify(applied)}
                     onClick={() => {
                        save(draft);
                        setOpen(false);
                     }}
                  />
                  <Button
                     label={tx('Reset')}
                     size="sm"
                     isDisabled={busy}
                     onClick={() => {
                        save(defaultMermaidPreferences, true);
                        setDraft(defaultMermaidPreferences);
                        setOpen(false);
                     }}
                  />
               </HStack>
            </VStack>
         </PopoverContent>
      </Popover>
   );
}
