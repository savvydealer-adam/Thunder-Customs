import { Search, ShoppingCart, Menu } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import logoUrl from "@assets/Thunder Customs Logo TRANSPARENT_1763572622278.png";

export function Header() {
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background">
      <div className="container mx-auto px-4">
        <div className="flex h-20 items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-3" data-testid="link-home">
            <img src={logoUrl} alt="Thunder Customs" className="h-14 w-auto" />
          </Link>

          <div className="hidden flex-1 max-w-2xl lg:flex">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search parts by name, part number, or category..."
                className="pl-10 pr-4 h-11"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                data-testid="input-search"
              />
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-2">
            <Link href="/products">
              <Button variant="ghost" data-testid="button-shop">
                Shop Parts
              </Button>
            </Link>
            <Link href="/admin">
              <Button variant="ghost" data-testid="button-admin">
                Admin
              </Button>
            </Link>
            <Button variant="ghost" size="icon" data-testid="button-cart">
              <ShoppingCart className="h-5 w-5" />
            </Button>
          </nav>

          <Button variant="ghost" size="icon" className="md:hidden" data-testid="button-menu">
            <Menu className="h-6 w-6" />
          </Button>
        </div>

        <div className="lg:hidden pb-4">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search parts..."
              className="pl-10 pr-4 h-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              data-testid="input-search-mobile"
            />
          </div>
        </div>
      </div>
    </header>
  );
}
