import { useEffect, useState } from "react";
import { useParams, useLocation, Redirect } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, Upload, CheckCircle, AlertCircle } from "lucide-react";
import { Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import type { Product } from "@shared/schema";

// Form schema for product updates
const decimalField = z.string().refine((val) => !val || /^\d+(\.\d{1,2})?$/.test(val), {
  message: "Must be a valid decimal number (e.g., 99.99)",
}).transform((val) => val === "" ? undefined : val).optional();

const productUpdateSchema = z.object({
  // Legacy fields
  price: decimalField,
  cost: decimalField,
  description: z.string().transform((val) => val === "" ? undefined : val).optional(),
  
  // New comprehensive pricing fields
  laborHours: decimalField,
  partCost: decimalField,
  salesMarkup: decimalField,
  salesOperator: z.string().optional(),
  salesType: z.string().optional(),
  costToSales: decimalField,
  salesInstallation: decimalField,
  totalCostToSales: decimalField,
  partMSRP: decimalField,
  retailMarkup: decimalField,
  retailOperator: z.string().optional(),
  retailType: z.string().optional(),
  partRetail: decimalField,
  retailInstallation: decimalField,
  totalRetail: decimalField,
});

type ProductUpdateForm = z.infer<typeof productUpdateSchema>;

export default function ProductEdit() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user, isAdmin, isLoading: isAuthLoading } = useAuth();
  
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>("");

  const { data: product, isLoading: isProductLoading } = useQuery<Product>({
    queryKey: ["/api/products", id],
    enabled: !!id,
  });

  const form = useForm<ProductUpdateForm>({
    resolver: zodResolver(productUpdateSchema),
    defaultValues: {
      price: "",
      cost: "",
      description: "",
      laborHours: "",
      partCost: "",
      salesMarkup: "",
      salesOperator: "",
      salesType: "",
      costToSales: "",
      salesInstallation: "",
      totalCostToSales: "",
      partMSRP: "",
      retailMarkup: "",
      retailOperator: "",
      retailType: "",
      partRetail: "",
      retailInstallation: "",
      totalRetail: "",
    },
  });

  // Reset form when product loads
  useEffect(() => {
    if (product) {
      form.reset({
        price: product.price || "",
        cost: product.cost || "",
        description: product.description || "",
        laborHours: product.laborHours || "",
        partCost: product.partCost || "",
        salesMarkup: product.salesMarkup || "",
        salesOperator: product.salesOperator || "",
        salesType: product.salesType || "",
        costToSales: product.costToSales || "",
        salesInstallation: product.salesInstallation || "",
        totalCostToSales: product.totalCostToSales || "",
        partMSRP: product.partMSRP || "",
        retailMarkup: product.retailMarkup || "",
        retailOperator: product.retailOperator || "",
        retailType: product.retailType || "",
        partRetail: product.partRetail || "",
        retailInstallation: product.retailInstallation || "",
        totalRetail: product.totalRetail || "",
      });
      setImagePreview(product.imageUrl || "");
    }
  }, [product, form]);

  const updateProductMutation = useMutation({
    mutationFn: async (data: ProductUpdateForm) => {
      return await apiRequest('PATCH', `/api/admin/products/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      toast({
        title: "Product Updated",
        description: "Product details have been saved successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update product.",
        variant: "destructive",
      });
    },
  });

  const uploadImageMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('image', file);
      return await apiRequest('POST', `/api/admin/products/${id}/image`, formData);
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/products", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      setImagePreview(data.product.imageUrl);
      setImageFile(null);
      toast({
        title: "Image Uploaded",
        description: "Product image has been updated successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Upload Failed",
        description: error.message || "Failed to upload image.",
        variant: "destructive",
      });
    },
  });

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUploadImage = () => {
    if (imageFile) {
      uploadImageMutation.mutate(imageFile);
    }
  };

  const onSubmit = (data: ProductUpdateForm) => {
    // Normalize monetary fields to 2 decimal places, use null for intentional clears
    const normalizedData: any = {};
    
    // Helper function to normalize decimal fields
    const normalizeDecimal = (value: string | undefined) => {
      if (value === undefined) return undefined;
      const trimmed = value?.trim();
      return trimmed && trimmed !== "" ? parseFloat(trimmed).toFixed(2) : null;
    };
    
    // Helper function to normalize string fields
    const normalizeString = (value: string | undefined) => {
      if (value === undefined) return undefined;
      const trimmed = value?.trim();
      return trimmed && trimmed !== "" ? trimmed : null;
    };
    
    // Legacy fields
    normalizedData.price = normalizeDecimal(data.price);
    normalizedData.cost = normalizeDecimal(data.cost);
    normalizedData.description = normalizeString(data.description);
    
    // New comprehensive pricing fields
    normalizedData.laborHours = normalizeDecimal(data.laborHours);
    normalizedData.partCost = normalizeDecimal(data.partCost);
    normalizedData.salesMarkup = normalizeDecimal(data.salesMarkup);
    normalizedData.salesOperator = normalizeString(data.salesOperator);
    normalizedData.salesType = normalizeString(data.salesType);
    normalizedData.costToSales = normalizeDecimal(data.costToSales);
    normalizedData.salesInstallation = normalizeDecimal(data.salesInstallation);
    normalizedData.totalCostToSales = normalizeDecimal(data.totalCostToSales);
    normalizedData.partMSRP = normalizeDecimal(data.partMSRP);
    normalizedData.retailMarkup = normalizeDecimal(data.retailMarkup);
    normalizedData.retailOperator = normalizeString(data.retailOperator);
    normalizedData.retailType = normalizeString(data.retailType);
    normalizedData.partRetail = normalizeDecimal(data.partRetail);
    normalizedData.retailInstallation = normalizeDecimal(data.retailInstallation);
    normalizedData.totalRetail = normalizeDecimal(data.totalRetail);
    
    updateProductMutation.mutate(normalizedData);
  };

  if (isAuthLoading || isProductLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!user || !isAdmin) {
    return <Redirect to="/" />;
  }

  if (!product) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Product not found</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <main className="flex-1">
        <div className="container mx-auto px-4 py-8 max-w-4xl">
          <div className="mb-6 flex items-center gap-4">
            <Link href={`/products/${id}`}>
              <Button variant="ghost" size="icon" data-testid="button-back">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-3xl font-bold" data-testid="text-page-title">Edit Product</h1>
              <p className="text-muted-foreground mt-1">{product.partName}</p>
            </div>
          </div>

          <div className="grid gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Product Image</CardTitle>
                <CardDescription>Upload a custom image for this product</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {imagePreview && (
                  <div className="mb-4">
                    <img
                      src={imagePreview}
                      alt="Product preview"
                      className="w-full max-w-md h-64 object-contain bg-muted rounded-lg"
                      data-testid="img-preview"
                    />
                  </div>
                )}
                <div>
                  <Label htmlFor="image-upload">Select Image</Label>
                  <Input
                    id="image-upload"
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    className="mt-2"
                    data-testid="input-image"
                  />
                </div>
                <Button
                  onClick={handleUploadImage}
                  disabled={!imageFile || uploadImageMutation.isPending}
                  className="gap-2"
                  data-testid="button-upload-image"
                >
                  {uploadImageMutation.isPending ? (
                    <>Uploading...</>
                  ) : (
                    <>
                      <Upload className="h-4 w-4" />
                      Upload Image
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Product Details</CardTitle>
                <CardDescription>Update comprehensive pricing and description</CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                    
                    {/* Labor Section */}
                    <div className="space-y-4">
                      <h3 className="font-semibold text-sm">Labor</h3>
                      <FormField
                        control={form.control}
                        name="laborHours"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Labor Hours</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                step="0.01"
                                placeholder="0.00"
                                data-testid="input-labor-hours"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    {/* Cost & Sales Pricing Section */}
                    <div className="space-y-4 pt-4 border-t">
                      <h3 className="font-semibold text-sm">Cost & Sales Pricing</h3>
                      <div className="grid md:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="partCost"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Part Cost</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  step="0.01"
                                  placeholder="0.00"
                                  data-testid="input-part-cost"
                                  {...field}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="salesMarkup"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Sales Markup</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  step="0.01"
                                  placeholder="0.00"
                                  data-testid="input-sales-markup"
                                  {...field}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="salesOperator"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Sales Operator</FormLabel>
                              <FormControl>
                                <Input
                                  placeholder="$ or %"
                                  data-testid="input-sales-operator"
                                  {...field}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="salesType"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Sales Type</FormLabel>
                              <FormControl>
                                <Input
                                  placeholder="PC or PM"
                                  data-testid="input-sales-type"
                                  {...field}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="costToSales"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Cost to Sales</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  step="0.01"
                                  placeholder="0.00"
                                  data-testid="input-cost-to-sales"
                                  {...field}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="salesInstallation"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Sales Installation</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  step="0.01"
                                  placeholder="0.00"
                                  data-testid="input-sales-installation"
                                  {...field}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="totalCostToSales"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Total Cost to Sales</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  step="0.01"
                                  placeholder="0.00"
                                  data-testid="input-total-cost-to-sales"
                                  {...field}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>

                    {/* Retail Pricing Section (Customer-Facing) */}
                    <div className="space-y-4 pt-4 border-t">
                      <h3 className="font-semibold text-sm">Retail Pricing (Customer-Facing)</h3>
                      <div className="grid md:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="partMSRP"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Part MSRP</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  step="0.01"
                                  placeholder="0.00"
                                  data-testid="input-part-msrp"
                                  {...field}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="retailMarkup"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Retail Markup</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  step="0.01"
                                  placeholder="0.00"
                                  data-testid="input-retail-markup"
                                  {...field}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="retailOperator"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Retail Operator</FormLabel>
                              <FormControl>
                                <Input
                                  placeholder="$ or %"
                                  data-testid="input-retail-operator"
                                  {...field}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="retailType"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Retail Type</FormLabel>
                              <FormControl>
                                <Input
                                  placeholder="PC or PM"
                                  data-testid="input-retail-type"
                                  {...field}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="partRetail"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Part Retail ⭐</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  step="0.01"
                                  placeholder="0.00"
                                  data-testid="input-part-retail"
                                  {...field}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="retailInstallation"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Retail Installation</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  step="0.01"
                                  placeholder="0.00"
                                  data-testid="input-retail-installation"
                                  {...field}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="totalRetail"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Total Retail ⭐</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  step="0.01"
                                  placeholder="0.00"
                                  data-testid="input-total-retail"
                                  {...field}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">⭐ These fields are displayed to customers</p>
                    </div>

                    {/* Description */}
                    <div className="pt-4 border-t">
                      <FormField
                        control={form.control}
                        name="description"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Description</FormLabel>
                            <FormControl>
                              <Textarea
                                placeholder="Enter a brief product description..."
                                rows={4}
                                data-testid="input-description"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    {updateProductMutation.isSuccess && (
                      <Alert>
                        <CheckCircle className="h-4 w-4" />
                        <AlertDescription>Changes saved successfully!</AlertDescription>
                      </Alert>
                    )}

                    {updateProductMutation.isError && (
                      <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>
                          {updateProductMutation.error?.message || "Failed to save changes"}
                        </AlertDescription>
                      </Alert>
                    )}

                    <Button
                      type="submit"
                      disabled={updateProductMutation.isPending}
                      data-testid="button-save-details"
                    >
                      {updateProductMutation.isPending ? "Saving..." : "Save All Details"}
                    </Button>
                  </form>
                </Form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Product Information</CardTitle>
                <CardDescription>Read-only product details</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Part Number:</span>
                    <div className="font-medium">{product.partNumber}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Manufacturer:</span>
                    <div className="font-medium">{product.manufacturer}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Category:</span>
                    <div className="font-medium">{product.category}</div>
                  </div>
                  {product.vehicleMake && (
                    <div>
                      <span className="text-muted-foreground">Vehicle Make:</span>
                      <div className="font-medium">{product.vehicleMake}</div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
