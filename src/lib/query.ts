import { QueryClient } from "@tanstack/react-query";

/** Shared cache for TanStack Query (used by the mock API and future real endpoints). */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});
