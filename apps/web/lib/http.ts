export class ApiRequestError extends Error {
   constructor(
      message: string,
      readonly status: number
   ) {
      super(message);
      this.name = 'ApiRequestError';
   }
}

export async function responseData<T>(
   response: Response,
   fallback = 'Could not load data.'
): Promise<T> {
   const payload = (await response.json().catch(() => null)) as {
      data?: T;
      message?: string | string[];
   } | null;
   if (!response.ok || !payload || !('data' in payload)) {
      const message = Array.isArray(payload?.message) ? payload.message[0] : payload?.message;
      throw new ApiRequestError(message ?? fallback, response.status);
   }
   return payload.data as T;
}
