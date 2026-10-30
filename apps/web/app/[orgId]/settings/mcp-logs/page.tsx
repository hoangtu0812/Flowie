import MainLayout from '@/components/layout/main-layout';
import Header from '@/components/layout/headers/settings/header';
import { McpLogs } from '@/components/settings/mcp/mcp-logs';

export default function Page() {
   return (
      <MainLayout header={<Header />} headersNumber={1}>
         <McpLogs />
      </MainLayout>
   );
}
