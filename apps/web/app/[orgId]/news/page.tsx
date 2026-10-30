import MainLayout from '@/components/layout/main-layout';
import { NewsFeed, NewsHeader } from '@/features/news/news-page';

export default function NewsPage() {
   return (
      <MainLayout header={<NewsHeader />} headersNumber={1}>
         <NewsFeed />
      </MainLayout>
   );
}
