import MainLayout from '@/components/layout/main-layout';
import Header from '@/components/layout/headers/settings/header';
import { McpSettings } from '@/features/settings/mcp/mcp-settings';

export default function Page() {
   return (
      <MainLayout header={<Header />} headersNumber={1}>
         <McpSettings />
      </MainLayout>
   );
}
