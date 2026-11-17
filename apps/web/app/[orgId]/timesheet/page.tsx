import MainLayout from '@/components/layout/main-layout';
import { TimesheetPage } from '@/features/worklogs/timesheet-page';

export default function Page() {
   return (
      <MainLayout>
         <TimesheetPage />
      </MainLayout>
   );
}
