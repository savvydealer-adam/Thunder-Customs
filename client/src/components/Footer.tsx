import { LogIn, LogOut } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

export function Footer() {
  const { user, isAuthenticated } = useAuth();

  return (
    <footer className="border-t bg-muted/30 py-4 mt-auto">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>&copy; {new Date().getFullYear()} Thunder Customs. All rights reserved.</span>
          
          {isAuthenticated && user ? (
            <a 
              href="/api/logout" 
              className="flex items-center gap-1 hover:text-foreground transition-colors"
              data-testid="link-logout"
            >
              <LogOut className="h-3 w-3" />
              <span>Staff: {user.email}</span>
            </a>
          ) : (
            <div className="flex items-center gap-3">
              <a 
                href="/api/login" 
                className="flex items-center gap-1 hover:text-foreground transition-colors"
                data-testid="link-login"
              >
                <LogIn className="h-3 w-3" />
                <span>Log In</span>
              </a>
              <span className="text-muted-foreground/50">|</span>
              <a 
                href="/api/login" 
                className="flex items-center gap-1 hover:text-foreground transition-colors"
                data-testid="link-create-account"
              >
                <span>Create Account</span>
              </a>
            </div>
          )}
        </div>
      </div>
    </footer>
  );
}
