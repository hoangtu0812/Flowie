import MainLayout from '@/components/layout/main-layout';
import { DiscordIntegration } from '@/components/settings/discord-integration';
import Header from '@/components/layout/headers/settings/header';

export default function Page() {
   return (
      <MainLayout header={<Header />} headersNumber={1}>
         <DiscordIntegration />
      </MainLayout>
   );
}
