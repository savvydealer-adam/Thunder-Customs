import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Header } from "@/components/Header";
import { ProductCard } from "@/components/ProductCard";
import { ProductFilters } from "@/components/ProductFilters";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import type { Product } from "@shared/schema";

export default function Products() {
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedManufacturers, setSelectedManufacturers] = useState<string[]>([]);
  const [selectedVehicleMakes, setSelectedVehicleMakes] = useState<string[]>([]);
  const [selectedVehicleModels, setSelectedVehicleModels] = useState<string[]>([]);

  const buildFilteredUrl = () => {
    const params = new URLSearchParams();
    if (selectedCategories.length === 1) params.set('category', selectedCategories[0]);
    if (selectedManufacturers.length === 1) params.set('manufacturer', selectedManufacturers[0]);
    if (selectedVehicleMakes.length === 1) params.set('vehicleMake', selectedVehicleMakes[0]);
    if (selectedVehicleModels.length === 1) params.set('vehicleModel', selectedVehicleModels[0]);
    const query = params.toString();
    return query ? `/api/products?${query}` : '/api/products';
  };

  const hasSingleFilter = 
    (selectedCategories.length === 1 && selectedManufacturers.length === 0 && selectedVehicleMakes.length === 0 && selectedVehicleModels.length === 0) ||
    (selectedCategories.length === 0 && selectedManufacturers.length === 1 && selectedVehicleMakes.length === 0 && selectedVehicleModels.length === 0) ||
    (selectedCategories.length === 0 && selectedManufacturers.length === 0 && selectedVehicleMakes.length === 1 && selectedVehicleModels.length === 0) ||
    (selectedCategories.length === 0 && selectedManufacturers.length === 0 && selectedVehicleMakes.length === 0 && selectedVehicleModels.length === 1);

  const { data: products, isLoading, error } = useQuery<Product[]>({
    queryKey: [buildFilteredUrl()],
  });

  const handleCategoryChange = (category: string, checked: boolean) => {
    setSelectedCategories(prev =>
      checked ? [...prev, category] : prev.filter(c => c !== category)
    );
  };

  const handleManufacturerChange = (manufacturer: string, checked: boolean) => {
    setSelectedManufacturers(prev =>
      checked ? [...prev, manufacturer] : prev.filter(m => m !== manufacturer)
    );
  };

  const handleVehicleMakeChange = (make: string, checked: boolean) => {
    setSelectedVehicleMakes(prev =>
      checked ? [...prev, make] : prev.filter(m => m !== make)
    );
    // Clear model selection when make changes
    setSelectedVehicleModels([]);
  };

  const handleVehicleModelChange = (model: string, checked: boolean) => {
    setSelectedVehicleModels(prev =>
      checked ? [...prev, model] : prev.filter(m => m !== model)
    );
  };

  const handleClearAll = () => {
    setSelectedCategories([]);
    setSelectedManufacturers([]);
    setSelectedVehicleMakes([]);
    setSelectedVehicleModels([]);
  };

  const filteredProducts = products?.filter(product => {
    if (!hasSingleFilter) {
      if (selectedCategories.length > 0 && !selectedCategories.includes(product.category)) {
        return false;
      }
      if (selectedManufacturers.length > 0 && !selectedManufacturers.includes(product.manufacturer)) {
        return false;
      }
      if (selectedVehicleMakes.length > 0 && product.vehicleMake && !selectedVehicleMakes.includes(product.vehicleMake)) {
        return false;
      }
      if (selectedVehicleModels.length > 0 && (!product.vehicleModel || !selectedVehicleModels.includes(product.vehicleModel))) {
        return false;
      }
    }
    if (product.isHidden) {
      return false;
    }
    return true;
  }) || [];

  const categories = Array.from(new Set(products?.map(p => p.category) || []))
    .filter(Boolean)
    .sort()
    .map(cat => ({
      value: cat,
      label: cat,
      count: products?.filter(p => p.category === cat && !p.isHidden).length || 0,
    }));

  const manufacturers = Array.from(new Set(products?.map(p => p.manufacturer) || []))
    .filter(Boolean)
    .sort()
    .map(mfr => ({
      value: mfr,
      label: mfr,
      count: products?.filter(p => p.manufacturer === mfr && !p.isHidden).length || 0,
    }));

  const vehicleMakes = Array.from(new Set(products?.map(p => p.vehicleMake).filter(Boolean) || []))
    .sort()
    .map(make => ({
      value: make!,
      label: make!,
      count: products?.filter(p => p.vehicleMake === make && !p.isHidden).length || 0,
    }));

  // Get models for the selected make(s)
  const vehicleModels = selectedVehicleMakes.length === 1
    ? Array.from(new Set(
        products
          ?.filter(p => p.vehicleMake === selectedVehicleMakes[0] && p.vehicleModel)
          .map(p => p.vehicleModel!)
          .filter(Boolean) || []
      ))
        .sort()
        .map(model => ({
          value: model,
          label: model,
          count: products?.filter(p => p.vehicleModel === model && !p.isHidden).length || 0,
        }))
    : [];

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-background via-muted/10 to-background">
      <Header />
      
      <main className="flex-1">
        <div className="bg-gradient-to-r from-primary/5 via-secondary/5 to-primary/5 border-b">
          <div className="container mx-auto px-4 py-12">
            <h1 className="text-4xl md:text-5xl font-bold mb-3">Shop Parts</h1>
            <p className="text-muted-foreground text-lg">
              Browse our complete catalog of automotive accessories
            </p>
          </div>
        </div>

        <div className="container mx-auto px-4 py-8">

          <div className="flex flex-col lg:flex-row gap-8">
            <aside className="lg:w-80 flex-shrink-0">
              <div className="lg:sticky lg:top-24">
                <ProductFilters
                  categories={categories}
                  manufacturers={manufacturers}
                  vehicleMakes={vehicleMakes}
                  vehicleModels={vehicleModels}
                  selectedCategories={selectedCategories}
                  selectedManufacturers={selectedManufacturers}
                  selectedVehicleMakes={selectedVehicleMakes}
                  selectedVehicleModels={selectedVehicleModels}
                  onCategoryChange={handleCategoryChange}
                  onManufacturerChange={handleManufacturerChange}
                  onVehicleMakeChange={handleVehicleMakeChange}
                  onVehicleModelChange={handleVehicleModelChange}
                  onClearAll={handleClearAll}
                />
              </div>
            </aside>

            <div className="flex-1">
              {error && (
                <Alert variant="destructive" className="mb-6">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Failed to load products. Please try again later.
                  </AlertDescription>
                </Alert>
              )}

              <div className="mb-6 flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {isLoading ? (
                    "Loading products..."
                  ) : (
                    `Showing ${filteredProducts.length} products`
                  )}
                </p>
              </div>

              {isLoading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="space-y-4">
                      <Skeleton className="aspect-square w-full" />
                      <Skeleton className="h-6 w-3/4" />
                      <Skeleton className="h-4 w-1/2" />
                    </div>
                  ))}
                </div>
              ) : filteredProducts.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredProducts.map((product) => (
                    <ProductCard key={product.id} product={product} />
                  ))}
                </div>
              ) : (
                <div className="text-center py-16">
                  <p className="text-muted-foreground">
                    No products found matching your filters.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
