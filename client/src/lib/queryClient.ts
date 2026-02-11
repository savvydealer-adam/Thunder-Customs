import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

let csrfToken: string | null = null;

async function ensureCsrfToken(): Promise<string> {
  if (csrfToken) return csrfToken;
  const res = await fetch('/api/csrf-token', { credentials: 'include' });
  if (res.ok) {
    const data = await res.json();
    csrfToken = data.csrfToken;
    return csrfToken!;
  }
  return '';
}

export function clearCsrfToken() {
  csrfToken = null;
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<any> {
  const isFormData = data instanceof FormData;
  const headers: Record<string, string> = {};
  
  if (!isFormData && data) {
    headers["Content-Type"] = "application/json";
  }
  
  if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(method.toUpperCase())) {
    const token = await ensureCsrfToken();
    if (token) {
      headers["x-csrf-token"] = token;
    }
  }
  
  const res = await fetch(url, {
    method,
    headers,
    body: isFormData ? data : (data ? JSON.stringify(data) : undefined),
    credentials: "include",
  });

  if (res.status === 403) {
    const text = await res.text();
    if (text.includes('csrf') || text.includes('CSRF')) {
      csrfToken = null;
      const retryToken = await ensureCsrfToken();
      headers["x-csrf-token"] = retryToken;
      const retry = await fetch(url, {
        method,
        headers,
        body: isFormData ? data : (data ? JSON.stringify(data) : undefined),
        credentials: "include",
      });
      await throwIfResNotOk(retry);
      return retry.json();
    }
    throw new Error(`${res.status}: ${text}`);
  }

  await throwIfResNotOk(res);
  return res.json();
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
