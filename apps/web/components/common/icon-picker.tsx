'use client';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Smile } from 'lucide-react';
import { useState } from 'react';

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
}: {
   value?: string;
   onChange: (icon: string) => void;
   label?: string;
   className?: string;
}) {
   const [open, setOpen] = useState(false);

   return (
      <Popover open={open} onOpenChange={setOpen}>
         <PopoverTrigger asChild>
            <Button
               type="button"
               variant="outline"
               size="sm"
               className={className}
               aria-label={label}
               title={label}
            >
               <Smile className="size-4" />
               <span className="hidden sm:inline">Choose</span>
            </Button>
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
