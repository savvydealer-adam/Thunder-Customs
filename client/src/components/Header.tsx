import { Search, ShoppingCart, Menu, LogIn, LogOut, User, Shield, ClipboardList, FileBox } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import logoUrl from "@assets/Thunder Customs Logo TRANSPARENT_1763572622278.png";
import { useAuth } from "@/hooks/useAuth";
import { useCart } from "@/contexts/CartContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function Header() {
  const [searchQuery, setSearchQuery] = useState("");
  const { user, isAuthenticated, isAdmin, isStrictAdmin, isStaff } = useAuth();
  const { getTotalItems } = useCart();
  const cartItemCount = getTotalItems();

  const getInitials = (firstName?: string | null, lastName?: string | null) => {
    if (!firstName && !lastName) return "U";
    return `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase();
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background">
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-3 shrink-0" data-testid="link-home">
            <img src={logoUrl} alt="Thunder Customs" className="h-12 w-auto" />
          </Link>

          <div className="hidden flex-1 max-w-2xl lg:flex">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search parts by name, part number, or category..."
                className="pl-10 pr-4"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                data-testid="input-search"
              />
            </div>
          </div>

          <nav className="flex items-center gap-2">
            <Link href="/products" className="hidden sm:block">
              <Button variant="ghost" data-testid="button-shop">
                Shop Parts
              </Button>
            </Link>
            
            {isStaff && (
              <Link href="/leads" className="hidden sm:block">
                <Button variant="ghost" data-testid="button-leads">
                  <ClipboardList className="w-4 h-4 mr-2" />
                  Leads
                </Button>
              </Link>
            )}
            
            {isStaff && (
              <Link href="/orders" className="hidden sm:block">
                <Button variant="ghost" data-testid="button-orders">
                  <FileBox className="w-4 h-4 mr-2" />
                  Orders
                </Button>
              </Link>
            )}
            
            {isAdmin && (
              <Link href="/admin" className="hidden sm:block">
                <Button variant="ghost" data-testid="button-admin">
                  <Shield className="w-4 h-4 mr-2" />
                  Admin
                </Button>
              </Link>
            )}
            
            <Link href="/cart">
              <Button variant="ghost" size="icon" className="relative hidden sm:flex" data-testid="button-cart">
                <ShoppingCart className="h-5 w-5" />
                {cartItemCount > 0 && (
                  <Badge 
                    variant="destructive" 
                    className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
                    data-testid="badge-cart-count"
                  >
                    {cartItemCount}
                  </Badge>
                )}
              </Button>
            </Link>

            {!isAuthenticated && (
              <>
                <a href="/api/login">
                  <Button variant="ghost" className="hidden sm:flex gap-2" data-testid="button-login">
                    <LogIn className="h-4 w-4" />
                    Log In
                  </Button>
                </a>
                <a href="/api/login">
                  <Button variant="default" className="hidden sm:flex gap-2" data-testid="button-create-account">
                    <User className="h-4 w-4" />
                    Create Account
                  </Button>
                </a>
              </>
            )}

            {isAuthenticated && user && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="gap-2" data-testid="button-user-menu">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={user.profileImageUrl || undefined} className="object-cover" />
                      <AvatarFallback>{getInitials(user.firstName, user.lastName)}</AvatarFallback>
                    </Avatar>
                    <span className="hidden lg:inline">
                      {user.firstName || user.lastName 
                        ? `${user.firstName || ''} ${user.lastName || ''}`.trim()
                        : user.email || 'Account'}
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none">
                        {user.firstName || user.lastName 
                          ? `${user.firstName || ''} ${user.lastName || ''}`.trim()
                          : 'My Account'}
                      </p>
                      <p className="text-xs leading-none text-muted-foreground">
                        {user.email}
                      </p>
                      {user.role && (
                        <p className="text-xs leading-none text-primary capitalize">
                          {user.role}
                        </p>
                      )}
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/profile" data-testid="menu-profile">
                      <User className="w-4 h-4 mr-2" />
                      My Profile
                    </Link>
                  </DropdownMenuItem>
                  {isStaff && (
                    <DropdownMenuItem asChild>
                      <Link href="/leads" data-testid="menu-leads">
                        <ClipboardList className="w-4 h-4 mr-2" />
                        Lead Requests
                      </Link>
                    </DropdownMenuItem>
                  )}
                  {isStaff && (
                    <DropdownMenuItem asChild>
                      <Link href="/orders" data-testid="menu-orders">
                        <FileBox className="w-4 h-4 mr-2" />
                        Orders
                      </Link>
                    </DropdownMenuItem>
                  )}
                  {isAdmin && (
                    <DropdownMenuItem asChild>
                      <Link href="/admin" data-testid="menu-admin">
                        <Shield className="w-4 h-4 mr-2" />
                        Admin Panel
                      </Link>
                    </DropdownMenuItem>
                  )}
                  {isStrictAdmin && (
                    <DropdownMenuItem asChild>
                      <Link href="/employees" data-testid="menu-employees">
                        <User className="w-4 h-4 mr-2" />
                        Manage Employees
                      </Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <a href="/api/logout" className="w-full" data-testid="button-logout">
                      <LogOut className="w-4 h-4 mr-2" />
                      Log Out
                    </a>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            <Button variant="ghost" size="icon" className="sm:hidden" data-testid="button-menu">
              <Menu className="h-6 w-6" />
            </Button>
          </nav>
        </div>
      </div>
    </header>
  );
}
