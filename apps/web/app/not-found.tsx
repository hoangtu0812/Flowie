import Link from 'next/link';
import { VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { DesignSurface } from '@/components/common/design-surface';
export default function NotFound() {
   return (
      <DesignSurface>
         <VStack as="main" minHeight="100svh" justify="center" align="center" gap={4} padding={6}>
            <Heading level={1}>Page not found</Heading>
            <Text>
               The requested page is unavailable. Check the link or return to your workspace.
            </Text>
            <Link href="/">Go to Flowie home</Link>
         </VStack>
      </DesignSurface>
   );
}
