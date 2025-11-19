import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

interface FilterOption {
  value: string;
  label: string;
  count?: number;
}

interface ProductFiltersProps {
  categories: FilterOption[];
  manufacturers: FilterOption[];
  vehicleMakes: FilterOption[];
  selectedCategories: string[];
  selectedManufacturers: string[];
  selectedVehicleMakes: string[];
  onCategoryChange: (category: string, checked: boolean) => void;
  onManufacturerChange: (manufacturer: string, checked: boolean) => void;
  onVehicleMakeChange: (make: string, checked: boolean) => void;
  onClearAll: () => void;
}

export function ProductFilters({
  categories,
  manufacturers,
  vehicleMakes,
  selectedCategories,
  selectedManufacturers,
  selectedVehicleMakes,
  onCategoryChange,
  onManufacturerChange,
  onVehicleMakeChange,
  onClearAll,
}: ProductFiltersProps) {
  const hasActiveFilters = 
    selectedCategories.length > 0 || 
    selectedManufacturers.length > 0 || 
    selectedVehicleMakes.length > 0;

  return (
    <div className="space-y-4">
      {hasActiveFilters && (
        <Button 
          variant="outline" 
          onClick={onClearAll} 
          className="w-full gap-2"
          data-testid="button-clear-filters"
        >
          <X className="h-4 w-4" />
          Clear All Filters
        </Button>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Vehicle Make</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-64">
            <div className="space-y-3">
              {vehicleMakes.map((make) => (
                <div key={make.value} className="flex items-center gap-2">
                  <Checkbox
                    id={`make-${make.value}`}
                    checked={selectedVehicleMakes.includes(make.value)}
                    onCheckedChange={(checked) => 
                      onVehicleMakeChange(make.value, checked as boolean)
                    }
                    data-testid={`checkbox-make-${make.value}`}
                  />
                  <Label 
                    htmlFor={`make-${make.value}`}
                    className="text-sm cursor-pointer flex-1"
                  >
                    {make.label}
                    {make.count !== undefined && (
                      <span className="text-muted-foreground ml-1">({make.count})</span>
                    )}
                  </Label>
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Category</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-64">
            <div className="space-y-3">
              {categories.map((category) => (
                <div key={category.value} className="flex items-center gap-2">
                  <Checkbox
                    id={`category-${category.value}`}
                    checked={selectedCategories.includes(category.value)}
                    onCheckedChange={(checked) => 
                      onCategoryChange(category.value, checked as boolean)
                    }
                    data-testid={`checkbox-category-${category.value}`}
                  />
                  <Label 
                    htmlFor={`category-${category.value}`}
                    className="text-sm cursor-pointer flex-1"
                  >
                    {category.label}
                    {category.count !== undefined && (
                      <span className="text-muted-foreground ml-1">({category.count})</span>
                    )}
                  </Label>
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Manufacturer</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-48">
            <div className="space-y-3">
              {manufacturers.map((manufacturer) => (
                <div key={manufacturer.value} className="flex items-center gap-2">
                  <Checkbox
                    id={`manufacturer-${manufacturer.value}`}
                    checked={selectedManufacturers.includes(manufacturer.value)}
                    onCheckedChange={(checked) => 
                      onManufacturerChange(manufacturer.value, checked as boolean)
                    }
                    data-testid={`checkbox-manufacturer-${manufacturer.value}`}
                  />
                  <Label 
                    htmlFor={`manufacturer-${manufacturer.value}`}
                    className="text-sm cursor-pointer flex-1"
                  >
                    {manufacturer.label}
                    {manufacturer.count !== undefined && (
                      <span className="text-muted-foreground ml-1">({manufacturer.count})</span>
                    )}
                  </Label>
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
