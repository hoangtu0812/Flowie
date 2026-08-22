import MainLayout from '@/components/layout/main-layout';
import { RealLabelsSettings } from '@/components/settings/real-labels-settings';

export default function Page() {
   return (
      <MainLayout
         header={<div className="w-full border-b px-6 py-3 font-medium">Issue labels</div>}
         headersNumber={1}
      >
         <RealLabelsSettings />
      </MainLayout>
   );
}
