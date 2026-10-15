'use client';
import type { ReactNode } from 'react';
import { Card } from '@astryxdesign/core/Card';
import { VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';

export function ChartPanel({
   title,
   description,
   children,
   className = '',
}: {
   title: string;
   description: string;
   children: ReactNode;
   className?: string;
}) {
   return (
      <Card padding={0} elevation="none" className={`min-w-0 ${className}`}>
         <VStack padding={5} gap={1}>
            <Heading level={4} accessibilityLevel={2}>
               {title}
            </Heading>
            <Text type="supporting">{description}</Text>
         </VStack>
         {children}
      </Card>
   );
}

export function ChartTooltip({
   active,
   label,
   payload,
}: {
   active?: boolean;
   label?: string | number;
   payload?: readonly { name?: string | number; value?: string | number }[];
}) {
   if (!active) return null;
   return (
      <VStack padding={3} gap={1} className="bg-surface rounded-lg shadow-md">
         {label !== undefined && <Text weight="semibold">{label}</Text>}
         {payload?.map((row, index) => (
            <Text key={index}>
               {row.name}: {row.value}
            </Text>
         ))}
      </VStack>
   );
}
