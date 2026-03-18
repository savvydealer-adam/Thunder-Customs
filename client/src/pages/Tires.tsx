import { useQuery } from "@tanstack/react-query";
import { ProductCard } from "@/components/ProductCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertCircle, Phone } from "lucide-react";
import { Link } from "wouter";
import type { Product } from "@shared/schema";

interface PaginatedProducts {
  products: Product[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export default function Tires() {
  const { data, isLoading, error } = useQuery<PaginatedProducts>({
    queryKey: ['/api/products', { category: 'Tires', pageSize: 100 }],
    queryFn: async () => {
      const res = await fetch('/api/products?category=Tires&pageSize=100');
      if (!res.ok) throw new Error('Failed to fetch tires');
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  // Filter to only show real products with images and real pricing (exclude $0.02 placeholders)
  const tires = (data?.products || []).filter(
    (p) => p.imageUrl && parseFloat(p.partRetail || p.price || '0') > 1
  );

  // Group by manufacturer for organized display
  const grouped = tires.reduce<Record<string, Product[]>>((acc, tire) => {
    const mfr = tire.manufacturer;
    if (!acc[mfr]) acc[mfr] = [];
    acc[mfr].push(tire);
    return acc;
  }, {});

  // Sort manufacturers alphabetically
  const manufacturers = Object.keys(grouped).sort();

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-background via-muted/10 to-background">
      {/* Hero Section */}
      <section className="bg-gradient-to-r from-primary/10 via-secondary/5 to-primary/10 border-b">
        <div className="container mx-auto px-4 py-10 md:py-14">
          <h1 className="text-3xl md:text-5xl font-bold mb-3">
            Shop Tires
          </h1>
          <p className="text-muted-foreground text-lg md:text-xl mb-2 max-w-2xl">
            Premium off-road and all-terrain tires from top brands.
            Professional installation available at Thunder Customs.
          </p>
          <p className="text-sm text-muted-foreground">
            Thunder Chrysler Dodge Jeep Ram &mdash; Bartow, FL
          </p>
        </div>
      </section>

      <main className="flex-1">
        <div className="container mx-auto px-4 py-8">
          {error && (
            <Alert variant="destructive" className="mb-6">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Failed to load tires. Please try again later.
              </AlertDescription>
            </Alert>
          )}

          {isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="space-y-3">
                  <Skeleton className="aspect-square w-full" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              ))}
            </div>
          ) : tires.length > 0 ? (
            <>
              <p className="text-sm text-muted-foreground mb-6">
                Showing {tires.length} tires
              </p>

              {manufacturers.map((mfr) => (
                <div key={mfr} className="mb-10">
                  <h2 className="text-2xl font-bold mb-4 border-b pb-2">{mfr} Tires</h2>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                    {grouped[mfr].map((tire) => (
                      <ProductCard key={tire.id} product={tire} />
                    ))}
                  </div>
                </div>
              ))}

              {/* CTA Section */}
              <div className="mt-12 bg-muted/50 rounded-lg p-8 text-center">
                <h2 className="text-2xl font-bold mb-2">Need Help Choosing?</h2>
                <p className="text-muted-foreground mb-4 max-w-xl mx-auto">
                  Our team can help you find the right tires for your vehicle.
                  Contact our accessories department for expert recommendations.
                </p>
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <a href="tel:+18635331500">
                    <Button size="lg" className="gap-2">
                      <Phone className="h-4 w-4" />
                      Call (863) 533-1500
                    </Button>
                  </a>
                  <Link href="/products">
                    <Button size="lg" variant="outline">
                      Browse All Parts
                    </Button>
                  </Link>
                </div>
              </div>
            </>
          ) : (
            <div className="text-center py-16">
              <p className="text-muted-foreground">
                No tires available at this time. Please check back soon.
              </p>
              <Link href="/products">
                <Button variant="ghost" className="mt-2">
                  Browse All Products
                </Button>
              </Link>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
