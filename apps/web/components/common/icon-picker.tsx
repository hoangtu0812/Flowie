'use client';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Smile } from 'lucide-react';
import { type ReactNode, useState } from 'react';

/** A curated, dependency-free icon set shared by workspace, team and initiative settings. */
export const FLOWIE_ICON_CHOICES = [
   '👥',
   '🎯',
   '🚀',
   '💡',
   '📦',
   '⚙️',
   '🧩',
   '🎨',
   '💻',
   '📱',
   '🔒',
   '☁️',
   '📊',
   '🧪',
   '📣',
   '✅',
   '🗂️',
   '📚',
   '🔍',
   '🧭',
   '⚡',
   '🔥',
   '🏗️',
   '🧱',
   '🛡️',
   '🎓',
   '🤖',
   '✨',
   '🪄',
   '📈',
   '🧠',
   '🌱',
   '🌍',
   '🏆',
   '📝',
   '📅',
   '⏱️',
   '🧰',
   '🛰️',
   '🗺️',
   '🎧',
   '💬',
   '🤝',
   '💎',
   '🖥️',
   '🎬',
   '📷',
   '🧮',
   '🔗',
   '🏠',
   '💼',
   '🛠️',
   '🌟',
   '🎉',
   '🧬',
   '📡',
   '🗃️',
   '🪴',
   '🎲',
   '🧷',
] as const;

export function IconPicker({
   value,
   onChange,
   label = 'Choose icon',
   className,
   compact = false,
   trigger,
}: {
   value?: string;
   onChange: (icon: string) => void;
   label?: string;
   className?: string;
   compact?: boolean;
   /**
    * Replaces the default "Choose" button, for example to open the picker by clicking the
    * current icon. It must be a single element that accepts a ref and onClick.
    * VI: Thay nút "Choose" mặc định, ví dụ để mở bộ chọn khi bấm vào icon hiện tại. Phải là
    * một phần tử duy nhất nhận được ref và onClick.
    */
   trigger?: ReactNode;
}) {
   const [open, setOpen] = useState(false);

   return (
      <Popover open={open} onOpenChange={setOpen}>
         <PopoverTrigger asChild>
            {trigger ?? (
               <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={className}
                  aria-label={label}
                  title={label}
               >
                  <Smile className="size-4" />
                  {!compact && <span className="hidden sm:inline">Choose</span>}
               </Button>
            )}
         </PopoverTrigger>
         <PopoverContent align="end" className="w-80 p-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Choose an icon</p>
            <div className="grid grid-cols-10 gap-1">
               {FLOWIE_ICON_CHOICES.map((icon) => (
                  <Button
                     type="button"
                     key={icon}
                     variant={value === icon ? 'secondary' : 'ghost'}
                     size="icon"
                     className="size-7 text-base"
                     aria-label={`Use ${icon} as icon`}
                     onClick={() => {
                        onChange(icon);
                        setOpen(false);
                     }}
                  >
                     {icon}
                  </Button>
               ))}
            </div>
         </PopoverContent>
      </Popover>
   );
}
