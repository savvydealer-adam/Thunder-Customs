import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Upload, CheckCircle, AlertCircle, FileText, X, ImageIcon } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { Redirect } from "wouter";

export default function Admin() {
  const { user, isAdmin, isLoading: isAuthLoading } = useAuth();
  const [files, setFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const uploadMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      return await apiRequest('POST', '/api/admin/import-batch', formData) as {
        success: boolean;
        totalImported: number;
        filesProcessed: number;
        totalFiles: number;
      };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/products'] });
      toast({
        title: "Import Successful",
        description: `Imported ${data.totalImported} products from ${data.filesProcessed} file(s).`,
      });
      setFiles([]);
      setUploadProgress(100);
    },
    onError: (error: Error) => {
      toast({
        title: "Import Failed",
        description: error.message || "Failed to import products. Please try again.",
        variant: "destructive",
      });
      setUploadProgress(0);
    },
  });

  const placeholderImageMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', '/api/admin/populate-placeholders', {}) as {
        success: boolean;
        updated: number;
        total: number;
      };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/products'] });
      toast({
        title: "Placeholder Images Added",
        description: `Added Thunder Customs branded images to ${data.updated} products.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Add Images",
        description: error.message || "Failed to populate placeholder images. Please try again.",
        variant: "destructive",
      });
    },
  });

  const imageSourceMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', '/api/admin/populate-images', {}) as {
        success: boolean;
        updated: number;
        total: number;
      };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/products'] });
      toast({
        title: "Image Sourcing Complete",
        description: `Updated ${data.updated} product images.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Image Sourcing Failed",
        description: error.message || "Failed to populate images. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    if (selectedFiles.length > 0) {
      setFiles(selectedFiles);
      setUploadProgress(0);
    }
  };

  const removeFile = (index: number) => {
    setFiles(files.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (files.length === 0) return;

    const formData = new FormData();
    files.forEach((file) => {
      formData.append('files', file);
    });

    setUploadProgress(10);
    uploadMutation.mutate(formData);
  };

  const handlePopulatePlaceholders = () => {
    placeholderImageMutation.mutate();
  };

  const handlePopulateImages = () => {
    imageSourceMutation.mutate();
  };

  if (isAuthLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!user || !isAdmin) {
    return <Redirect to="/" />;
  }

  return (
    <div className="min-h-screen flex flex-col">
      
      <main className="flex-1">
        <div className="container mx-auto px-4 py-8 max-w-4xl">
          <div className="mb-8">
            <h1 className="text-4xl font-bold mb-2">Admin Portal</h1>
            <p className="text-muted-foreground">
              Manage products and import data from CSV files
            </p>
          </div>

          <div className="grid gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Upload className="h-5 w-5" />
                  Batch Import Products
                </CardTitle>
                <CardDescription>
                  Upload multiple CSV or HTML files exported from the parts catalog system
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="csv-file">Select Files (Multiple)</Label>
                  <Input
                    id="csv-file"
                    type="file"
                    accept=".csv,.xls,.html"
                    onChange={handleFileChange}
                    disabled={uploadMutation.isPending}
                    className="mt-2"
                    data-testid="input-file"
                    multiple
                  />
                  {files.length > 0 && (
                    <div className="mt-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{files.length} file(s) selected</span>
                        <Badge variant="secondary">{(files.reduce((sum, f) => sum + f.size, 0) / 1024).toFixed(2)} KB total</Badge>
                      </div>
                      <div className="max-h-48 overflow-y-auto space-y-1 border rounded-md p-2">
                        {files.map((file, index) => (
                          <div key={index} className="flex items-center justify-between gap-2 text-sm bg-muted/50 rounded px-2 py-1.5">
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <FileText className="h-4 w-4 flex-shrink-0" />
                              <span className="truncate">{file.name}</span>
                              <span className="text-xs text-muted-foreground flex-shrink-0">
                                ({(file.size / 1024).toFixed(2)} KB)
                              </span>
                            </div>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => removeFile(index)}
                              disabled={uploadMutation.isPending}
                              className="h-6 w-6 flex-shrink-0"
                              data-testid={`button-remove-file-${index}`}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {uploadProgress > 0 && uploadProgress < 100 && (
                  <div className="space-y-2">
                    <Label>Upload Progress</Label>
                    <Progress value={uploadProgress} />
                  </div>
                )}

                {uploadMutation.isSuccess && (
                  <Alert>
                    <CheckCircle className="h-4 w-4" />
                    <AlertDescription>
                      Products imported successfully! The catalog has been updated.
                    </AlertDescription>
                  </Alert>
                )}

                {uploadMutation.isError && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      {uploadMutation.error?.message || "Failed to import products"}
                    </AlertDescription>
                  </Alert>
                )}

                <Button
                  onClick={handleUpload}
                  disabled={files.length === 0 || uploadMutation.isPending}
                  className="w-full"
                  data-testid="button-upload"
                >
                  {uploadMutation.isPending ? "Importing..." : `Import ${files.length} File(s)`}
                </Button>

                <div className="text-sm text-muted-foreground space-y-2 pt-4 border-t">
                  <p className="font-medium">Supported Formats:</p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li>CSV files (.csv)</li>
                    <li>Excel files (.xls)</li>
                    <li>HTML export files (.html)</li>
                  </ul>
                  <p className="mt-4">
                    The import process will automatically parse product data including part names, 
                    manufacturers, categories, part numbers, and vehicle compatibility.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ImageIcon className="h-5 w-5" />
                  Product Images
                </CardTitle>
                <CardDescription>
                  Add placeholder images or source real images from Unsplash
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button
                  onClick={handlePopulatePlaceholders}
                  disabled={placeholderImageMutation.isPending}
                  className="w-full"
                  data-testid="button-populate-placeholders"
                >
                  {placeholderImageMutation.isPending ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-foreground mr-2" />
                      Adding Placeholder Images...
                    </>
                  ) : (
                    <>
                      <ImageIcon className="mr-2 h-4 w-4" />
                      Add Placeholder Images
                    </>
                  )}
                </Button>
                
                <div className="text-xs text-muted-foreground text-center">
                  Creates branded Thunder Customs placeholders (no API key needed)
                </div>

                <div className="relative my-3">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">or</span>
                  </div>
                </div>

                <Button
                  onClick={handlePopulateImages}
                  disabled={imageSourceMutation.isPending}
                  className="w-full"
                  variant="outline"
                  data-testid="button-populate-images"
                >
                  {imageSourceMutation.isPending ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-foreground mr-2" />
                      Sourcing Real Images...
                    </>
                  ) : (
                    <>
                      <ImageIcon className="mr-2 h-4 w-4" />
                      Source Real Images (Requires Unsplash API)
                    </>
                  )}
                </Button>

                {placeholderImageMutation.isSuccess && (
                  <Alert>
                    <CheckCircle className="h-4 w-4" />
                    <AlertDescription>
                      Placeholder images added successfully!
                    </AlertDescription>
                  </Alert>
                )}

                {imageSourceMutation.isSuccess && (
                  <Alert>
                    <CheckCircle className="h-4 w-4" />
                    <AlertDescription>
                      Product images updated successfully!
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>System Information</CardTitle>
                <CardDescription>
                  Current database and catalog status
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Data Source</span>
                  <span className="text-sm font-medium">CSV Import + MOPAR API Ready</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Last Updated</span>
                  <span className="text-sm font-medium">{new Date().toLocaleDateString()}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
