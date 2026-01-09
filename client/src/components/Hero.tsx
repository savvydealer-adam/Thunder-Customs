import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { ArrowRight } from "lucide-react";
import thunderLogo from "@assets/Thunder Customs Logo TRANSPARENT_1763572622278.png";

export function Hero() {
  return (
    <section className="relative w-full overflow-hidden min-h-[600px] md:min-h-[700px] flex items-center">
      <div 
        className="absolute inset-0"
        style={{ 
          background: `linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 25%, #16213e 50%, #0f3460 75%, #1a1a2e 100%)`
        }}
      />
      
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/60" />

      <div className="container relative z-10 mx-auto px-4 py-20 md:py-28">
        <div className="flex flex-col items-center text-center gap-8 max-w-5xl mx-auto">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/20 px-4 py-1.5 text-sm bg-white/10 backdrop-blur-sm">
            <span className="h-2 w-2 rounded-full bg-primary animate-pulse"></span>
            <span className="font-medium text-white">Premium Automotive Accessories</span>
          </div>
          
          <img 
            src={thunderLogo} 
            alt="Thunder Customs" 
            className="w-full max-w-md md:max-w-xl lg:max-w-2xl h-auto"
            data-testid="img-thunder-logo"
          />
          
          <p className="text-xl md:text-2xl text-white/90 max-w-2xl font-medium">
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
              <Button 
                size="lg" 
                variant="outline" 
                className="min-w-40 border-white/30 text-white backdrop-blur-sm" 
                data-testid="button-protection"
              >
                Protection Products
              </Button>
            </Link>
          </div>

          <div className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-8 w-full max-w-3xl">
            <div className="flex flex-col gap-1">
              <div className="text-3xl md:text-4xl font-bold text-primary">1000+</div>
              <div className="text-sm text-white/80">Products</div>
            </div>
            <div className="flex flex-col gap-1">
              <div className="text-3xl md:text-4xl font-bold text-primary">35+</div>
              <div className="text-sm text-white/80">Vehicle Makes</div>
            </div>
            <div className="flex flex-col gap-1">
              <div className="text-3xl md:text-4xl font-bold text-primary">30+</div>
              <div className="text-sm text-white/80">Categories</div>
            </div>
            <div className="flex flex-col gap-1">
              <div className="text-3xl md:text-4xl font-bold text-primary">100%</div>
              <div className="text-sm text-white/80">Quality</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
