'use client';

import * as React from 'react';
import { format } from 'date-fns';
import { Calendar as CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface DatePickerProps {
   date: Date | undefined;
   onDateChange?: (date: Date | undefined) => void | Promise<void>;
   disabled?: boolean;
}

export function DatePicker({ date, onDateChange, disabled = false }: DatePickerProps) {
   const [selectedDate, setSelectedDate] = React.useState<Date | undefined>(date);
   const [open, setOpen] = React.useState<boolean>(false);

   React.useEffect(() => setSelectedDate(date), [date]);

   const handleDateSelect = async (date: Date | undefined) => {
      if (!onDateChange) return;
      try {
         await onDateChange(date);
         setSelectedDate(date);
         setOpen(false);
      } catch {
         // The parent keeps the persisted value and renders the API error.
      }
   };

   return (
      <Popover open={open} onOpenChange={setOpen}>
         <PopoverTrigger asChild>
            <Button
               variant="ghost"
               className="h-7 px-2 justify-start text-left font-normal"
               size="sm"
               disabled={disabled}
            >
               <CalendarIcon className="h-4 w-4 md:mr-0.5" />
               {selectedDate ? (
                  <span className="text-xs hidden xl:inline mt-[1px]">
                     {format(selectedDate, 'MMM dd, yyyy')}
                  </span>
               ) : (
                  <span className="text-xs text-muted-foreground hidden xl:inline mt-[1px]">
                     No date
                  </span>
               )}
            </Button>
         </PopoverTrigger>
         <PopoverContent className="w-auto p-0" align="start">
            <Calendar
               mode="single"
               selected={selectedDate}
               onSelect={handleDateSelect}
               initialFocus
            />
         </PopoverContent>
      </Popover>
   );
}
