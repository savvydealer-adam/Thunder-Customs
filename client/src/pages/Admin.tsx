import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Header } from "@/components/Header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Upload, CheckCircle, AlertCircle, FileText } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function Admin() {
  const [file, setFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const uploadMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      return await apiRequest('POST', '/api/admin/import-csv', formData);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/products'] });
      toast({
        title: "Import Successful",
        description: `Imported ${data.imported} products successfully.`,
      });
      setFile(null);
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setUploadProgress(0);
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    setUploadProgress(10);
    uploadMutation.mutate(formData);
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      
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
                  Import Products from CSV
                </CardTitle>
                <CardDescription>
                  Upload CSV or HTML files exported from the parts catalog system
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="csv-file">Select File</Label>
                  <Input
                    id="csv-file"
                    type="file"
                    accept=".csv,.xls,.html"
                    onChange={handleFileChange}
                    disabled={uploadMutation.isPending}
                    className="mt-2"
                    data-testid="input-file"
                  />
                  {file && (
                    <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                      <FileText className="h-4 w-4" />
                      <span>{file.name}</span>
                      <span className="text-xs">({(file.size / 1024).toFixed(2)} KB)</span>
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
                  disabled={!file || uploadMutation.isPending}
                  className="w-full"
                  data-testid="button-upload"
                >
                  {uploadMutation.isPending ? "Importing..." : "Import Products"}
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
