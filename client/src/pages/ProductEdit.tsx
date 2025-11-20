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
const productUpdateSchema = z.object({
  price: z.string().refine((val) => !val || /^\d+(\.\d{1,2})?$/.test(val), {
    message: "Price must be a valid decimal number (e.g., 99.99)",
  }).transform((val) => val === "" ? undefined : val).optional(),
  cost: z.string().refine((val) => !val || /^\d+(\.\d{1,2})?$/.test(val), {
    message: "Cost must be a valid decimal number (e.g., 99.99)",
  }).transform((val) => val === "" ? undefined : val).optional(),
  description: z.string().transform((val) => val === "" ? undefined : val).optional(),
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
    },
  });

  // Reset form when product loads
  useEffect(() => {
    if (product) {
      form.reset({
        price: product.price || "",
        cost: product.cost || "",
        description: product.description || "",
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
    
    // Handle price: normalize to 2 decimals or send null if cleared
    if (data.price !== undefined) {
      const trimmedPrice = data.price?.trim();
      normalizedData.price = trimmedPrice && trimmedPrice !== "" ? parseFloat(trimmedPrice).toFixed(2) : null;
    }
    
    // Handle cost: normalize to 2 decimals or send null if cleared
    if (data.cost !== undefined) {
      const trimmedCost = data.cost?.trim();
      normalizedData.cost = trimmedCost && trimmedCost !== "" ? parseFloat(trimmedCost).toFixed(2) : null;
    }
    
    // Handle description: send as-is or null if cleared
    if (data.description !== undefined) {
      const trimmedDesc = data.description?.trim();
      normalizedData.description = trimmedDesc && trimmedDesc !== "" ? trimmedDesc : null;
    }
    
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
                <CardDescription>Update pricing and description</CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <div className="grid md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="price"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>MSRP (Retail Price)</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                step="0.01"
                                placeholder="0.00"
                                data-testid="input-price"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="cost"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Cost (Your Cost)</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                step="0.01"
                                placeholder="0.00"
                                data-testid="input-cost"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

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
                      {updateProductMutation.isPending ? "Saving..." : "Save Details"}
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
