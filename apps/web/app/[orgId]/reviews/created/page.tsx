import Reviews from '@/features/reviews/reviews';
import MainLayout from '@/components/layout/main-layout';

export default function CreatedReviewsPage() {
   return (
      <MainLayout>
         <Reviews listTab="created" />
      </MainLayout>
   );
}
