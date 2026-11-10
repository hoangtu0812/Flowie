import Cycles from '@/features/cycles/cycles';
import Header from '@/components/layout/headers/cycles/header';
import MainLayout from '@/components/layout/main-layout';

export default function CyclesPage() {
   return (
      <MainLayout header={<Header />} headersNumber={1}>
         <Cycles />
      </MainLayout>
   );
}
