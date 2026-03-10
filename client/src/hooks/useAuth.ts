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
  const role = user?.role ?? 'customer';

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    // Is a regular customer (default role for new signups)
    isCustomer: role === 'customer',
    // Can access staff features (orders, leads) - any non-customer role
    isStaff: role === 'salesman' || role === 'staff' || role === 'manager' || role === 'admin',
    // Can access admin features (product management, admin dashboard)
    isAdmin: role === 'admin' || role === 'manager',
    // Can access strict admin features (user role management only)
    isStrictAdmin: role === 'admin',
  };
}
