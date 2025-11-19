// Reference: blueprint:javascript_log_in_with_replit
import { useQuery } from "@tanstack/react-query";
import { User } from "@shared/schema";

export function useAuth() {
  const { data, isLoading } = useQuery<{ user: User | null }>({
    queryKey: ["/api/auth/user"],
    queryFn: async () => {
      const response = await fetch("/api/auth/user", {
        credentials: "include",
      });
      
      if (!response.ok) {
        throw new Error(`${response.status}: ${response.statusText}`);
      }
      
      return await response.json();
    },
    retry: false,
  });

  const user = data?.user ?? null;

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    // Can access admin features (product management, admin dashboard)
    isAdmin: user?.role === 'admin' || user?.role === 'manager',
    // Can access strict admin features (employee management only)
    isStrictAdmin: user?.role === 'admin',
  };
}
