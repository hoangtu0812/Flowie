import { responseData } from '@/lib/http';
import { authenticatedFetch } from '@/lib/workspaces';

export type NewsCategory = { id: string; name: string; webhookUrlMasked?: string | null };
export type NewsSource = {
   id: string;
   categoryId: string;
   name: string;
   feedUrl: string;
   enabled: boolean;
   lastFetchedAt: string | null;
   lastError: string | null;
};
export type NewsItem = {
   id: string;
   title: string;
   url: string;
   summary: string | null;
   publishedAt: string;
   sourceName: string;
   categoryId: string;
};
export type NewsData = {
   canManage: boolean;
   categories: NewsCategory[];
   items: NewsItem[];
   sources?: NewsSource[];
};

/**
 * Calls `/news{path}?workspaceId=…` and unwraps `data`; a JSON body is sent when given. Errors
 * surface the API message (for example the allowed feed hosts) through ApiRequestError.
 * VI: Gọi `/news{path}?workspaceId=…` và lấy `data`; gửi body JSON nếu có. Lỗi mang thông báo
 * VI: của API (ví dụ danh sách host feed được phép) qua ApiRequestError.
 */
export async function newsRequest<T>(
   workspaceId: string,
   path = '',
   method = 'GET',
   body?: unknown
): Promise<T> {
   const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
   return responseData<T>(
      await authenticatedFetch(
         `${api}/news${path}?workspaceId=${encodeURIComponent(workspaceId)}`,
         body === undefined
            ? { method }
            : {
                 method,
                 headers: { 'content-type': 'application/json' },
                 body: JSON.stringify(body),
              }
      )
   );
}
