import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { User, Shield, AlertCircle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { User as UserType } from "@shared/schema";
import { Redirect } from "wouter";

export default function EmployeeManagement() {
  const { user: currentUser, isAdmin, isLoading: isAuthLoading } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: users, isLoading: isUsersLoading } = useQuery<UserType[]>({
    queryKey: ["/api/users"],
    enabled: !!currentUser && isAdmin,
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      return await apiRequest('PATCH', `/api/users/${userId}/role`, { role });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({
        title: "Role Updated",
        description: "Employee role has been updated successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update employee role.",
        variant: "destructive",
      });
    },
  });

  if (isAuthLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!currentUser || !isAdmin) {
    return <Redirect to="/" />;
  }

  const handleRoleChange = (userId: string, newRole: string) => {
    if (userId === currentUser.id) {
      toast({
        title: "Cannot Change Own Role",
        description: "You cannot change your own role.",
        variant: "destructive",
      });
      return;
    }
    updateRoleMutation.mutate({ userId, role: newRole });
  };

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case "admin":
        return "destructive";
      case "manager":
        return "default";
      case "staff":
        return "secondary";
      default:
        return "outline";
    }
  };

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2 flex items-center gap-2">
          <Shield className="w-8 h-8" />
          Employee Management
        </h1>
        <p className="text-muted-foreground">
          Manage Thunder Customs team member access and permissions
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Team Members</CardTitle>
          <CardDescription>
            View and manage employee roles and access levels
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isUsersLoading ? (
            <div className="flex items-center justify-center py-8">
              <p className="text-muted-foreground">Loading employees...</p>
            </div>
          ) : !users || users.length === 0 ? (
            <Alert>
              <User className="h-4 w-4" />
              <AlertDescription>
                No employees found. Users will appear here after logging in for the first time.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-4">
              {users.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover-elevate"
                  data-testid={`row-user-${user.id}`}
                >
                  <div className="flex items-center gap-4">
                    <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10">
                      <User className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium" data-testid={`text-name-${user.id}`}>
                        {user.firstName && user.lastName
                          ? `${user.firstName} ${user.lastName}`
                          : user.firstName || user.lastName || "No Name"}
                      </p>
                      <p className="text-sm text-muted-foreground" data-testid={`text-email-${user.id}`}>
                        {user.email}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge
                      variant={getRoleBadgeVariant(user.role)}
                      className="capitalize"
                      data-testid={`badge-role-${user.id}`}
                    >
                      {user.role}
                    </Badge>
                    {user.id === currentUser.id ? (
                      <Badge variant="outline" data-testid={`badge-current-${user.id}`}>
                        You
                      </Badge>
                    ) : (
                      <Select
                        value={user.role}
                        onValueChange={(value) => handleRoleChange(user.id, value)}
                        disabled={updateRoleMutation.isPending}
                      >
                        <SelectTrigger
                          className="w-32"
                          data-testid={`select-role-${user.id}`}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="manager">Manager</SelectItem>
                          <SelectItem value="staff">Staff</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-6 p-4 bg-muted rounded-lg">
            <h3 className="font-semibold mb-2 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              Role Permissions
            </h3>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li>
                <strong>Admin:</strong> Full access to all features including employee management
              </li>
              <li>
                <strong>Manager:</strong> Can manage products and view admin features
              </li>
              <li>
                <strong>Staff:</strong> Basic access (browse products, no admin features)
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
