'use client';

import { CircleCheck } from 'lucide-react';
import { motion } from 'motion/react';

/** Springs a check mark into view; remount it to replay the animation. */
export function SuccessMark({ label }: { label: string }) {
   return (
      <motion.span
         role="img"
         aria-label={label}
         className="inline-flex text-emerald-600 dark:text-emerald-400"
         initial={{ scale: 0, rotate: -45, opacity: 0 }}
         animate={{ scale: 1, rotate: 0, opacity: 1 }}
         transition={{ type: 'spring', stiffness: 420, damping: 18 }}
      >
         <CircleCheck className="size-5" aria-hidden="true" />
      </motion.span>
   );
}
