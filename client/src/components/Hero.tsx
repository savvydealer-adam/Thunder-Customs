import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { ArrowRight } from "lucide-react";

export function Hero() {
  return (
    <section className="relative w-full bg-gradient-to-br from-primary/10 via-background to-secondary/10">
      <div className="container mx-auto px-4 py-20 md:py-28">
        <div className="flex flex-col items-center text-center gap-6 max-w-4xl mx-auto">
          <div className="inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm bg-card">
            <span className="h-2 w-2 rounded-full bg-primary animate-pulse"></span>
            <span className="font-medium">Premium Automotive Accessories</span>
          </div>
          
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-transparent">
            Thunder Customs
          </h1>
          
          <p className="text-xl md:text-2xl text-muted-foreground max-w-2xl">
            Premium accessories and parts for your ride. Quality products from top manufacturers like Weathertech and more.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 mt-4">
            <Link href="/products">
              <Button size="lg" className="gap-2 min-w-40" data-testid="button-browse-parts">
                Browse Parts
                <ArrowRight className="h-5 w-5" />
              </Button>
            </Link>
            <Link href="/products?category=Protection Products">
              <Button size="lg" variant="outline" className="min-w-40" data-testid="button-protection">
                Protection Products
              </Button>
            </Link>
          </div>

          <div className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-8 w-full max-w-3xl">
            <div className="flex flex-col gap-1">
              <div className="text-3xl font-bold text-primary">1000+</div>
              <div className="text-sm text-muted-foreground">Products</div>
            </div>
            <div className="flex flex-col gap-1">
              <div className="text-3xl font-bold text-primary">20+</div>
              <div className="text-sm text-muted-foreground">Vehicle Makes</div>
            </div>
            <div className="flex flex-col gap-1">
              <div className="text-3xl font-bold text-primary">30+</div>
              <div className="text-sm text-muted-foreground">Categories</div>
            </div>
            <div className="flex flex-col gap-1">
              <div className="text-3xl font-bold text-primary">100%</div>
              <div className="text-sm text-muted-foreground">Quality</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
