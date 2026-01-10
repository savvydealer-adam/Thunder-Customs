import { Hero } from "@/components/Hero";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "wouter";
import { Package, Shield, Truck, Wrench } from "lucide-react";
import ramTruckImage from "@assets/2026 Ram Rebel Red_1763578750235.png";
import jeepImage from "@assets/2025_JL_PJ5_X9_JLJS74,2TY,22Y,APA,HT3,dg_fullfronthero___trn_1763578804575.png";

export default function Home() {
  const features = [
    {
      icon: Package,
      title: "Wide Selection",
      description: "9000+ premium automotive accessories and parts",
    },
    {
      icon: Shield,
      title: "Quality Guaranteed",
      description: "Top brands like Weathertech and certified products",
    },
    {
      icon: Truck,
      title: "Fast Shipping",
      description: "Quick delivery on all orders",
    },
    {
      icon: Wrench,
      title: "Expert Support",
      description: "Professional assistance from our team",
    },
  ];

  const popularCategories = [
    "Floor Mats",
    "Deflectors",
    "Step and Rocker Bars",
    "Protection Products",
    "Tires",
    "Suspension",
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <main className="flex-1">
        <Hero />

        <section className="py-16 bg-muted/30">
          <div className="container mx-auto px-4">
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {features.map((feature) => (
                <Card key={feature.title} className="border-none shadow-none bg-transparent">
                  <CardHeader className="pb-4">
                    <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-2">
                      <feature.icon className="h-6 w-6 text-primary" />
                    </div>
                    <CardTitle className="text-lg">{feature.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription>{feature.description}</CardDescription>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="py-16 bg-gradient-to-b from-background to-muted/20">
          <div className="container mx-auto px-4">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                Popular Categories
              </h2>
              <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
                Browse our most popular automotive accessory categories
              </p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {popularCategories.map((category) => (
                <Link key={category} href={`/products?category=${encodeURIComponent(category)}`}>
                  <Card className="hover-elevate active-elevate-2 h-full cursor-pointer" data-testid={`card-category-${category}`}>
                    <CardHeader className="text-center p-6">
                      <CardTitle className="text-sm leading-tight">
                        {category}
                      </CardTitle>
                    </CardHeader>
                  </Card>
                </Link>
              ))}
            </div>

            <div className="text-center mt-12">
              <Link href="/products">
                <Button size="lg" data-testid="button-view-all">
                  View All Products
                </Button>
              </Link>
            </div>
          </div>
        </section>

        <section className="py-16 lg:py-24">
          <div className="container mx-auto px-4">
            <div className="grid lg:grid-cols-2 gap-8 lg:gap-12">
              <div className="relative overflow-visible rounded-md hover-elevate active-elevate-2">
                <div 
                  className="h-80 lg:h-96 bg-cover bg-center rounded-md"
                  style={{ backgroundImage: `url(${ramTruckImage})` }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent rounded-md" />
                <div className="absolute bottom-0 left-0 right-0 p-6 md:p-8">
                  <h3 className="text-2xl md:text-3xl font-bold text-white mb-2">
                    Truck Accessories
                  </h3>
                  <p className="text-white/90 mb-4 text-sm md:text-base">
                    Lift kits, bed liners, step bars, and more for Ram, Ford, Chevy trucks
                  </p>
                  <Link href="/products?vehicleMake=Ram">
                    <Button variant="outline" className="border-white/30 text-white backdrop-blur-sm" data-testid="button-shop-ram">
                      Shop Ram Parts
                    </Button>
                  </Link>
                </div>
              </div>

              <div className="relative overflow-visible rounded-md hover-elevate active-elevate-2">
                <div 
                  className="h-80 lg:h-96 bg-cover bg-center rounded-md"
                  style={{ backgroundImage: `url(${jeepImage})` }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent rounded-md" />
                <div className="absolute bottom-0 left-0 right-0 p-6 md:p-8">
                  <h3 className="text-2xl md:text-3xl font-bold text-white mb-2">
                    Jeep Accessories
                  </h3>
                  <p className="text-white/90 mb-4 text-sm md:text-base">
                    Lift kits, rock sliders, winches, and trail-ready upgrades for Jeep Wranglers
                  </p>
                  <Link href="/products?vehicleMake=Jeep">
                    <Button variant="outline" className="border-white/30 text-white backdrop-blur-sm" data-testid="button-shop-jeep">
                      Shop Jeep Parts
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t bg-muted/30 py-12">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-3 gap-8">
            <div>
              <h3 className="font-bold text-lg mb-4">Thunder Customs</h3>
              <p className="text-sm text-muted-foreground">
                Premium automotive accessories for all major vehicle brands.
                Quality parts from trusted manufacturers.
              </p>
            </div>
            <div>
              <h3 className="font-bold text-lg mb-4">Quick Links</h3>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link href="/products" className="text-muted-foreground hover:text-foreground transition-colors">
                    Shop Parts
                  </Link>
                </li>
                <li>
                  <Link href="/admin" className="text-muted-foreground hover:text-foreground transition-colors">
                    Admin Portal
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="font-bold text-lg mb-4">Contact</h3>
              <p className="text-sm text-muted-foreground">
                Thunder Chrysler Dodge Jeep Ram<br />
                Automotive Accessories Department
              </p>
            </div>
          </div>
          <div className="mt-8 pt-8 border-t text-center text-sm text-muted-foreground">
            <p>&copy; 2025 Thunder Customs. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
