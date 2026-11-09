'use client';

import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { Check, ChevronDown, ChevronRight } from 'lucide-react';
import { useRef, useState } from 'react';
import { MIN_SETTINGS_SECTIONS, SettingsSectionNav, useSettingsSections } from './section-nav';

/**
 * Body shell shared by every settings page: the page scrolls inside itself, content is centered
 * at one max width and padding, and the header is a title, a short description and an optional
 * right-aligned action. Children stack with section spacing, so a page whose toolbar and list
 * belong together wraps them in one element. Astryx pages render it inside `DesignSurface`.
 * Pages with at least three h2/h3 section headings also get an "On this page" navigation: a
 * sticky rail beside the content on wide screens and a sticky bar above it on narrow ones. Without
 * it the column keeps its original width and centring.
 * VI: Khung thân dùng chung cho mọi trang cài đặt: trang tự cuộn bên trong, nội dung căn giữa
 * với cùng độ rộng tối đa và padding, phần đầu gồm tiêu đề, mô tả ngắn và một thao tác tùy chọn
 * căn phải. Các con xếp chồng với khoảng cách giữa các section, nên trang có thanh công cụ và
 * danh sách đi liền nhau phải bọc chúng trong một phần tử. Trang Astryx đặt nó trong `DesignSurface`.
 * VI: Trang có ít nhất ba tiêu đề section h2/h3 có thêm mục lục "On this page": cột dính bên cạnh
 * VI: nội dung trên màn hình rộng và thanh dính phía trên trên màn hình hẹp. Không có mục lục thì
 * VI: cột giữ độ rộng và cách căn giữa như cũ.
 */
export function SettingsShell({
   title,
   description,
   action,
   children,
}: {
   title: React.ReactNode;
   description: React.ReactNode;
   action?: React.ReactNode;
   children: React.ReactNode;
}) {
   const scrollRef = useRef<HTMLDivElement>(null);
   const contentRef = useRef<HTMLDivElement>(null);
   const sections = useSettingsSections(contentRef, scrollRef);
   const hasNav = sections.links.length >= MIN_SETTINGS_SECTIONS;
   return (
      <div ref={scrollRef} className="w-full overflow-y-auto h-full">
         <div
            className={cn(
               'max-w-4xl mx-auto px-6 py-10 pb-20',
               hasNav && 'xl:flex xl:max-w-6xl xl:gap-10'
            )}
         >
            <div className="min-w-0 flex-1">
               <div className="flex items-start justify-between gap-4">
                  <div>
                     <h1 className="text-2xl font-medium">{title}</h1>
                     <p className="text-sm text-muted-foreground mt-1">{description}</p>
                  </div>
                  {action}
               </div>
               <SettingsSectionNav {...sections} variant="bar" />
               <div
                  ref={contentRef}
                  className="flex flex-col gap-10 mt-10 [&_h2]:scroll-mt-20 [&_h3]:scroll-mt-20"
               >
                  {children}
               </div>
            </div>
            <SettingsSectionNav {...sections} variant="rail" />
         </div>
      </div>
   );
}

export function SettingsSection({
   title,
   description,
   action,
   children,
}: {
   title?: string;
   description?: React.ReactNode;
   action?: React.ReactNode;
   children: React.ReactNode;
}) {
   return (
      <section>
         {(title || action) && (
            <div className="flex items-end justify-between gap-4 mb-1">
               <div>
                  {title && <h2 className="text-md font-medium">{title}</h2>}
                  {description && (
                     <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
                  )}
               </div>
               {action}
            </div>
         )}
         <div className="mt-3 flex flex-col gap-3">{children}</div>
      </section>
   );
}

export function SettingsCard({
   children,
   className,
}: {
   children: React.ReactNode;
   className?: string;
}) {
   return (
      <div className={cn('rounded-lg border bg-container divide-y divide-border/60', className)}>
         {children}
      </div>
   );
}

/** A single settings row: optional icon, title + description, trailing control. */
export function SettingsRow({
   icon,
   title,
   description,
   trailing,
   chevron,
   onClick,
   muted,
   disabled,
   wrap,
}: {
   icon?: React.ReactNode;
   title: React.ReactNode;
   description?: React.ReactNode;
   trailing?: React.ReactNode;
   chevron?: boolean;
   onClick?: () => void;
   muted?: boolean;
   /** Keeps a settings row visible while preventing it from becoming interactive. */
   disabled?: boolean;
   /**
    * Lets the trailing control drop under the title when the row is narrower than the title's
    * 12rem minimum plus the control, for list rows whose metadata must stay readable on phones.
    * VI: Cho control bên phải xuống dưới tiêu đề khi hàng hẹp hơn 12rem tối thiểu của tiêu đề
    * cộng với control, dùng cho hàng danh sách cần giữ thông tin dễ đọc trên điện thoại.
    */
   wrap?: boolean;
}) {
   const Comp = onClick && !disabled ? 'button' : 'div';
   return (
      <Comp
         onClick={onClick}
         aria-disabled={disabled || undefined}
         className={cn(
            'w-full flex items-center gap-3 px-4 py-3 text-left',
            wrap && 'flex-wrap',
            onClick && !disabled && 'hover:bg-accent/40 transition-colors cursor-pointer',
            (muted || disabled) && 'opacity-60',
            disabled && 'cursor-not-allowed'
         )}
      >
         {icon && (
            <span className="inline-flex size-8 items-center justify-center rounded-md bg-muted/50 shrink-0 text-muted-foreground">
               {icon}
            </span>
         )}
         <div className={cn('flex-1', wrap ? 'min-w-48' : 'min-w-0')}>
            <div
               className={cn(
                  'text-sm font-medium flex items-center gap-x-2 gap-y-1',
                  wrap && 'flex-wrap'
               )}
            >
               {title}
            </div>
            {description && (
               <div className="text-xs text-muted-foreground mt-0.5">{description}</div>
            )}
         </div>
         {trailing && (
            <div className="shrink-0 flex items-center gap-2 text-sm text-muted-foreground">
               {trailing}
            </div>
         )}
         {chevron && <ChevronRight className="size-4 text-muted-foreground shrink-0" />}
      </Comp>
   );
}

/** Small functional select (local state) used across the settings pages. */
export function SelectMenu({
   options,
   defaultValue,
   value: controlledValue,
   onChange,
   disabled,
   label,
}: {
   label?: string;
   options: string[];
   defaultValue?: string;
   /** Optional controlled value (e.g. wired to next-themes). */
   value?: string;
   onChange?: (value: string) => void;
   disabled?: boolean;
}) {
   const [internal, setInternal] = useState(defaultValue ?? options[0]);
   const value = controlledValue ?? internal;
   return (
      <DropdownMenu>
         <DropdownMenuTrigger
            aria-label={label}
            disabled={disabled}
            className={cn(
               'h-8 px-3 rounded-md border bg-container text-sm inline-flex items-center gap-1.5 hover:bg-accent transition-colors outline-none',
               disabled && 'cursor-not-allowed opacity-60'
            )}
         >
            {value}
            <ChevronDown className="size-3.5 text-muted-foreground" />
         </DropdownMenuTrigger>
         <DropdownMenuContent align="end" className="min-w-40">
            {options.map((option) => (
               <DropdownMenuItem
                  key={option}
                  onClick={() => {
                     setInternal(option);
                     onChange?.(option);
                  }}
                  className="flex items-center gap-2 text-sm"
               >
                  <span className="flex-1">{option}</span>
                  {value === option && <Check className="size-3.5" />}
               </DropdownMenuItem>
            ))}
         </DropdownMenuContent>
      </DropdownMenu>
   );
}

/** "● Enabled ..." green-dot status text. */
export function EnabledDot({ children }: { children: React.ReactNode }) {
   return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
         <span className="size-1.5 rounded-full bg-[#00cc66] shrink-0" />
         {children}
      </span>
   );
}
