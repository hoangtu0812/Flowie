import MainLayout from '@/components/layout/main-layout';
import { RealNewTeam } from '@/components/settings/real-new-team';

export default function Page() {
   return (
      <MainLayout
         header={<div className="w-full border-b px-6 py-3 font-medium">Create team</div>}
         headersNumber={1}
      >
         <RealNewTeam />
      </MainLayout>
   );
}
