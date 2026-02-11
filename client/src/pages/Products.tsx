import { useState, useMemo, useEffect } from "react";
import { useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ProductCard } from "@/components/ProductCard";
import { ProductFilters } from "@/components/ProductFilters";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertCircle, Search, ChevronLeft, ChevronRight } from "lucide-react";
import type { Product } from "@shared/schema";

interface PaginatedProducts {
  products: Product[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface FilterOption {
  value: string;
  label: string;
}

interface FiltersData {
  categories: FilterOption[];
  manufacturers: FilterOption[];
  vehicleMakes: FilterOption[];
}

export default function Products() {
  const queryString = useSearch();
  const urlParams = new URLSearchParams(queryString);
  const initialSearch = urlParams.get('search') || '';

  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedManufacturers, setSelectedManufacturers] = useState<string[]>([]);
  const [selectedVehicleMakes, setSelectedVehicleMakes] = useState<string[]>([]);
  const [selectedVehicleModels, setSelectedVehicleModels] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [searchInput, setSearchInput] = useState(initialSearch);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    if (initialSearch && initialSearch !== searchQuery) {
      setSearchQuery(initialSearch);
      setSearchInput(initialSearch);
      setCurrentPage(1);
    }
  }, [initialSearch]);
  const pageSize = 48;

  const buildFilteredUrl = () => {
    const params = new URLSearchParams();
    params.set('page', currentPage.toString());
    params.set('pageSize', pageSize.toString());
    
    if (selectedCategories.length > 0) params.set('category', selectedCategories.join(','));
    if (selectedManufacturers.length > 0) params.set('manufacturer', selectedManufacturers.join(','));
    if (selectedVehicleMakes.length > 0) params.set('vehicleMake', selectedVehicleMakes.join(','));
    if (selectedVehicleModels.length > 0) params.set('vehicleModel', selectedVehicleModels.join(','));
    if (searchQuery) params.set('search', searchQuery);
    
    return `/api/products?${params.toString()}`;
  };

  const { data: filtersData } = useQuery<FiltersData>({
    queryKey: ['/api/filters'],
    staleTime: 5 * 60 * 1000,
  });

  const { data, isLoading, error, isFetching } = useQuery<PaginatedProducts>({
    queryKey: ['/api/products', currentPage, selectedCategories, selectedManufacturers, selectedVehicleMakes, selectedVehicleModels, searchQuery],
    queryFn: async () => {
      const res = await fetch(buildFilteredUrl());
      if (!res.ok) throw new Error('Failed to fetch products');
      return res.json();
    },
    staleTime: 30 * 1000,
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchQuery(searchInput);
    setCurrentPage(1);
  };

  const handleCategoryChange = (category: string, checked: boolean) => {
    setSelectedCategories(prev =>
      checked ? [...prev, category] : prev.filter(c => c !== category)
    );
    setCurrentPage(1);
  };

  const handleManufacturerChange = (manufacturer: string, checked: boolean) => {
    setSelectedManufacturers(prev =>
      checked ? [...prev, manufacturer] : prev.filter(m => m !== manufacturer)
    );
    setCurrentPage(1);
  };

  const handleVehicleMakeChange = (make: string, checked: boolean) => {
    setSelectedVehicleMakes(prev =>
      checked ? [...prev, make] : prev.filter(m => m !== make)
    );
    setSelectedVehicleModels([]);
    setCurrentPage(1);
  };

  const handleVehicleModelChange = (model: string, checked: boolean) => {
    setSelectedVehicleModels(prev =>
      checked ? [...prev, model] : prev.filter(m => m !== model)
    );
    setCurrentPage(1);
  };

  const handleClearAll = () => {
    setSelectedCategories([]);
    setSelectedManufacturers([]);
    setSelectedVehicleMakes([]);
    setSelectedVehicleModels([]);
    setSearchQuery("");
    setSearchInput("");
    setCurrentPage(1);
  };

  const categories = useMemo(() => 
    filtersData?.categories || [], 
    [filtersData]
  );

  const manufacturers = useMemo(() => 
    filtersData?.manufacturers || [], 
    [filtersData]
  );

  const vehicleMakes = useMemo(() => 
    filtersData?.vehicleMakes || [], 
    [filtersData]
  );

  const products = data?.products || [];
  const totalPages = data?.totalPages || 1;
  const total = data?.total || 0;

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-background via-muted/10 to-background">
      <main className="flex-1">
        <div className="bg-gradient-to-r from-primary/5 via-secondary/5 to-primary/5 border-b">
          <div className="container mx-auto px-4 py-8">
            <h1 className="text-3xl md:text-4xl font-bold mb-3">Shop Parts</h1>
            <p className="text-muted-foreground text-lg mb-4">
              Browse our complete catalog of automotive accessories
            </p>
            
            <form onSubmit={handleSearch} className="flex gap-2 max-w-xl">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  data-testid="input-search"
                  type="text"
                  placeholder="Search by part number, name, or manufacturer..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Button type="submit" data-testid="button-search">
                Search
              </Button>
            </form>
          </div>
        </div>

        <div className="container mx-auto px-4 py-6">
          <div className="flex flex-col lg:flex-row gap-6">
            <aside className="lg:w-72 flex-shrink-0">
              <div className="lg:sticky lg:top-24">
                <ProductFilters
                  categories={categories}
                  manufacturers={manufacturers}
                  vehicleMakes={vehicleMakes}
                  vehicleModels={[]}
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

              <div className="mb-4 flex items-center justify-between flex-wrap gap-2">
                <p className="text-sm text-muted-foreground" data-testid="text-product-count">
                  {isLoading ? (
                    "Loading products..."
                  ) : (
                    <>Showing {products.length} of {total.toLocaleString()} products</>
                  )}
                </p>
                
                {totalPages > 1 && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1 || isFetching}
                      data-testid="button-prev-page"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      Page {currentPage} of {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages || isFetching}
                      data-testid="button-next-page"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>

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
              ) : products.length > 0 ? (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                    {products.map((product) => (
                      <ProductCard key={product.id} product={product} />
                    ))}
                  </div>
                  
                  {totalPages > 1 && (
                    <div className="mt-8 flex justify-center gap-2">
                      <Button
                        variant="outline"
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1 || isFetching}
                        data-testid="button-prev-page-bottom"
                      >
                        <ChevronLeft className="h-4 w-4 mr-1" />
                        Previous
                      </Button>
                      <div className="flex items-center gap-1">
                        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                          let pageNum;
                          if (totalPages <= 5) {
                            pageNum = i + 1;
                          } else if (currentPage <= 3) {
                            pageNum = i + 1;
                          } else if (currentPage >= totalPages - 2) {
                            pageNum = totalPages - 4 + i;
                          } else {
                            pageNum = currentPage - 2 + i;
                          }
                          return (
                            <Button
                              key={pageNum}
                              variant={currentPage === pageNum ? "default" : "outline"}
                              size="sm"
                              onClick={() => setCurrentPage(pageNum)}
                              disabled={isFetching}
                              data-testid={`button-page-${pageNum}`}
                            >
                              {pageNum}
                            </Button>
                          );
                        })}
                      </div>
                      <Button
                        variant="outline"
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages || isFetching}
                        data-testid="button-next-page-bottom"
                      >
                        Next
                        <ChevronRight className="h-4 w-4 ml-1" />
                      </Button>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-16">
                  <p className="text-muted-foreground">
                    No products found matching your filters.
                  </p>
                  <Button 
                    variant="ghost" 
                    onClick={handleClearAll}
                    className="mt-2"
                    data-testid="button-clear-filters"
                  >
                    Clear all filters
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
