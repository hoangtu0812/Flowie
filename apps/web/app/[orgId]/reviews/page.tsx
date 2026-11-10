import Reviews from '@/features/reviews/reviews';
import MainLayout from '@/components/layout/main-layout';

export default function ReviewsPage() {
   return (
      <MainLayout>
         <Reviews listTab="assigned" />
      </MainLayout>
   );
}
