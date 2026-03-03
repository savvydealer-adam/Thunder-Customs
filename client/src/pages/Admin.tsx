import { useState, useRef } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, CheckCircle, AlertCircle, FileText, X, ImageIcon, Download, Database, Users, ShoppingCart, Shield, Mail, Phone, Calendar, Package, LogOut } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { Redirect } from "wouter";
import { format } from "date-fns";
import type { User as UserType } from "@shared/schema";

interface Order {
  id: number;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  vehicleInfo: string | null;
  notes: string | null;
  cartItems: any[];
  cartTotal: string | null;
  itemCount: number;
  status: string;
  createdBy: string;
  createdByName: string | null;
  assignedTo: string | null;
  createdAt: string;
  completedAt: string | null;
}

const statusColors: Record<string, string> = {
  pending: "bg-blue-500",
  processing: "bg-yellow-500",
  completed: "bg-green-500",
  cancelled: "bg-gray-500",
};

export default function Admin() {
  const { user, isAdmin, isLoading: isAuthLoading } = useAuth();
  const [files, setFiles] = useState<File[]>([]);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [activeTab, setActiveTab] = useState("orders");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Fetch all orders for admin view
  const { data: orders, isLoading: isOrdersLoading } = useQuery<Order[]>({
    queryKey: ['/api/orders'],
    enabled: !!user && isAdmin,
  });

  // Fetch all users for admin view
  const { data: users, isLoading: isUsersLoading } = useQuery<UserType[]>({
    queryKey: ['/api/users'],
    enabled: !!user && isAdmin,
  });

  // Role update mutation
  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      return await apiRequest('PATCH', `/api/users/${userId}/role`, { role });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users'] });
      toast({
        title: "Role Updated",
        description: "User role has been updated successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update user role.",
        variant: "destructive",
      });
    },
  });

  // Order status update mutation
  const updateOrderMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      return await apiRequest('PATCH', `/api/orders/${id}`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
      toast({
        title: "Order Updated",
        description: "Order status has been updated successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Update Failed",
        description: "Failed to update order status.",
        variant: "destructive",
      });
    },
  });

  const handleRoleChange = (userId: string, newRole: string) => {
    if (userId === user?.id) {
      toast({
        title: "Cannot Change Own Role",
        description: "You cannot change your own role.",
        variant: "destructive",
      });
      return;
    }
    updateRoleMutation.mutate({ userId, role: newRole });
  };

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case "admin": return "destructive";
      case "manager": return "default";
      case "salesman":
      case "staff": return "secondary";
      case "customer": return "outline";
      default: return "outline";
    }
  };

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

  const fixBrokenImagesMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', '/api/admin/fix-broken-images', {}) as {
        success: boolean;
        fixed: number;
        total: number;
        results: Array<{ partNumber: string; status: string; imageUrl?: string }>;
      };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/products'] });
      toast({
        title: "Broken Images Fixed",
        description: `Fixed ${data.fixed} of ${data.total} broken images using Google Image Search.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Fix Failed",
        description: error.message || "Failed to fix broken images. Make sure GOOGLE_API_KEY and GOOGLE_CSE_ID are configured.",
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

  const handleFixBrokenImages = () => {
    fixBrokenImagesMutation.mutate();
  };

  const pdfUploadMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      return await apiRequest('POST', '/api/admin/import-pdf-catalog', formData) as {
        success: boolean;
        imported: number;
        total: number;
        filename: string;
      };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/products'] });
      toast({
        title: "PDF Import Successful",
        description: `Imported ${data.imported} products from ${data.filename}.`,
      });
      setPdfFile(null);
    },
    onError: (error: Error) => {
      toast({
        title: "PDF Import Failed",
        description: error.message || "Failed to import PDF catalog. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handlePdfFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile && selectedFile.type === 'application/pdf') {
      setPdfFile(selectedFile);
    } else if (selectedFile) {
      toast({
        title: "Invalid File Type",
        description: "Please select a PDF file.",
        variant: "destructive",
      });
    }
  };

  const handlePdfUpload = async () => {
    if (!pdfFile) return;

    const formData = new FormData();
    formData.append('file', pdfFile);

    pdfUploadMutation.mutate(formData);
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
        <div className="container mx-auto px-4 py-8 max-w-6xl">
          <div className="mb-8">
            <h1 className="text-4xl font-bold mb-2 flex items-center gap-3">
              <Shield className="w-8 h-8" />
              Admin Portal
            </h1>
            <p className="text-muted-foreground">
              Manage orders, users, and import product data
            </p>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="orders" className="flex items-center gap-2" data-testid="tab-orders">
                <ShoppingCart className="h-4 w-4" />
                Orders
              </TabsTrigger>
              <TabsTrigger value="users" className="flex items-center gap-2" data-testid="tab-users">
                <Users className="h-4 w-4" />
                Users
              </TabsTrigger>
              <TabsTrigger value="tools" className="flex items-center gap-2" data-testid="tab-tools">
                <Database className="h-4 w-4" />
                Data Tools
              </TabsTrigger>
            </TabsList>

            {/* Orders Tab */}
            <TabsContent value="orders" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ShoppingCart className="h-5 w-5" />
                    All Orders
                  </CardTitle>
                  <CardDescription>
                    View and manage all customer orders
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {isOrdersLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <p className="text-muted-foreground">Loading orders...</p>
                    </div>
                  ) : !orders || orders.length === 0 ? (
                    <Alert>
                      <Package className="h-4 w-4" />
                      <AlertDescription>
                        No orders found.
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <div className="space-y-3">
                      {orders.map((order) => (
                        <div
                          key={order.id}
                          className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border rounded-lg hover-elevate gap-4"
                          data-testid={`row-order-${order.id}`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-3 flex-wrap">
                              <span className="font-semibold">Order #{order.id}</span>
                              <Badge className={`${statusColors[order.status]} text-white`}>
                                {order.status}
                              </Badge>
                            </div>
                            <p className="font-medium mt-1">{order.customerName}</p>
                            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground mt-1">
                              {order.customerEmail && (
                                <span className="flex items-center gap-1">
                                  <Mail className="h-3 w-3" />
                                  {order.customerEmail}
                                </span>
                              )}
                              {order.customerPhone && (
                                <span className="flex items-center gap-1">
                                  <Phone className="h-3 w-3" />
                                  {order.customerPhone}
                                </span>
                              )}
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {format(new Date(order.createdAt), 'MMM d, yyyy')}
                              </span>
                              <span className="flex items-center gap-1">
                                <Package className="h-3 w-3" />
                                {order.itemCount} items
                              </span>
                            </div>
                            {order.cartTotal && (
                              <p className="font-semibold text-primary mt-1">${order.cartTotal}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <Select
                              value={order.status}
                              onValueChange={(value) => updateOrderMutation.mutate({ id: order.id, status: value })}
                              disabled={updateOrderMutation.isPending}
                            >
                              <SelectTrigger className="w-32" data-testid={`select-order-status-${order.id}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="pending">Pending</SelectItem>
                                <SelectItem value="processing">Processing</SelectItem>
                                <SelectItem value="completed">Completed</SelectItem>
                                <SelectItem value="cancelled">Cancelled</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Users Tab */}
            <TabsContent value="users" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    All User Accounts
                  </CardTitle>
                  <CardDescription>
                    Manage user roles and permissions
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {isUsersLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <p className="text-muted-foreground">Loading users...</p>
                    </div>
                  ) : !users || users.length === 0 ? (
                    <Alert>
                      <Users className="h-4 w-4" />
                      <AlertDescription>
                        No users found. Users will appear here after logging in for the first time.
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <div className="space-y-3">
                      {users.map((u) => (
                        <div
                          key={u.id}
                          className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border rounded-lg hover-elevate gap-4"
                          data-testid={`row-user-${u.id}`}
                        >
                          <div className="flex items-center gap-4">
                            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10">
                              <Users className="w-5 h-5 text-primary" />
                            </div>
                            <div>
                              <p className="font-medium" data-testid={`text-name-${u.id}`}>
                                {u.firstName && u.lastName
                                  ? `${u.firstName} ${u.lastName}`
                                  : u.firstName || u.lastName || "No Name"}
                              </p>
                              <p className="text-sm text-muted-foreground" data-testid={`text-email-${u.id}`}>
                                {u.email}
                              </p>
                              {u.phone && (
                                <p className="text-sm text-muted-foreground flex items-center gap-1">
                                  <Phone className="h-3 w-3" />
                                  {u.phone}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <Badge
                              variant={getRoleBadgeVariant(u.role)}
                              className="capitalize"
                              data-testid={`badge-role-${u.id}`}
                            >
                              {u.role}
                            </Badge>
                            {u.id === user?.id ? (
                              <Badge variant="outline" data-testid={`badge-current-${u.id}`}>
                                You
                              </Badge>
                            ) : (
                              <Select
                                value={u.role}
                                onValueChange={(value) => handleRoleChange(u.id, value)}
                                disabled={updateRoleMutation.isPending}
                              >
                                <SelectTrigger className="w-32" data-testid={`select-role-${u.id}`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="admin">Admin</SelectItem>
                                  <SelectItem value="manager">Manager</SelectItem>
                                  <SelectItem value="salesman">Salesman</SelectItem>
                                  <SelectItem value="staff">Staff (Legacy)</SelectItem>
                                  <SelectItem value="customer">Customer</SelectItem>
                                </SelectContent>
                              </Select>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="mt-6 p-4 bg-muted rounded-lg">
                    <h3 className="font-semibold mb-2 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4" />
                      Role Permissions
                    </h3>
                    <ul className="space-y-1 text-sm text-muted-foreground">
                      <li><strong>Admin:</strong> Full access to all features including user management</li>
                      <li><strong>Manager:</strong> Can manage products, orders, leads and admin features</li>
                      <li><strong>Salesman:</strong> Can create orders, view leads, and manage customers</li>
                      <li><strong>Staff (Legacy):</strong> Same as Salesman, for backward compatibility</li>
                      <li><strong>Customer:</strong> Can browse products, save cart info, and request quotes</li>
                    </ul>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Data Tools Tab */}
            <TabsContent value="tools" className="space-y-6">
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
                  <FileText className="h-5 w-5" />
                  PDF Catalog Import
                </CardTitle>
                <CardDescription>
                  Upload PDF catalogs to automatically extract part names, descriptions, and MSRP pricing
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="pdf-file">Select PDF Catalog</Label>
                  <Input
                    id="pdf-file"
                    type="file"
                    accept=".pdf,application/pdf"
                    onChange={handlePdfFileChange}
                    disabled={pdfUploadMutation.isPending}
                    className="mt-2"
                    data-testid="input-pdf-file"
                  />
                  {pdfFile && (
                    <div className="mt-3">
                      <div className="flex items-center justify-between gap-2 text-sm bg-muted/50 rounded px-3 py-2">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <FileText className="h-4 w-4 flex-shrink-0" />
                          <span className="truncate">{pdfFile.name}</span>
                          <span className="text-xs text-muted-foreground flex-shrink-0">
                            ({(pdfFile.size / 1024).toFixed(2)} KB)
                          </span>
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setPdfFile(null)}
                          disabled={pdfUploadMutation.isPending}
                          className="h-6 w-6 flex-shrink-0"
                          data-testid="button-remove-pdf"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                {pdfUploadMutation.isSuccess && (
                  <Alert>
                    <CheckCircle className="h-4 w-4" />
                    <AlertDescription>
                      PDF catalog imported successfully! Products added to the catalog.
                    </AlertDescription>
                  </Alert>
                )}

                {pdfUploadMutation.isError && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      {pdfUploadMutation.error?.message || "Failed to import PDF catalog"}
                    </AlertDescription>
                  </Alert>
                )}

                <Button
                  onClick={handlePdfUpload}
                  disabled={!pdfFile || pdfUploadMutation.isPending}
                  className="w-full"
                  data-testid="button-upload-pdf"
                >
                  {pdfUploadMutation.isPending ? "Parsing PDF..." : "Import PDF Catalog"}
                </Button>

                <div className="text-sm text-muted-foreground space-y-2 pt-4 border-t">
                  <p className="font-medium">What gets extracted:</p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li>Part numbers (e.g., "ABC-123")</li>
                    <li>Product names and descriptions</li>
                    <li>MSRP pricing (e.g., "$299.99")</li>
                    <li>Manufacturer information</li>
                  </ul>
                  <p className="mt-4 text-xs">
                    The parser uses smart pattern matching to identify product data from various PDF catalog formats.
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

                <div className="relative my-3">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">or</span>
                  </div>
                </div>

                <Button
                  onClick={handleFixBrokenImages}
                  disabled={fixBrokenImagesMutation.isPending}
                  className="w-full"
                  variant="destructive"
                  data-testid="button-fix-broken-images"
                >
                  {fixBrokenImagesMutation.isPending ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-foreground mr-2" />
                      Fixing Broken Images...
                    </>
                  ) : (
                    <>
                      <AlertCircle className="mr-2 h-4 w-4" />
                      Fix Broken Images (Google Search)
                    </>
                  )}
                </Button>

                <div className="text-xs text-muted-foreground text-center">
                  Finds products with "[object Object]" URLs and replaces with real images from Google
                </div>

                {fixBrokenImagesMutation.isSuccess && (
                  <Alert>
                    <CheckCircle className="h-4 w-4" />
                    <AlertDescription>
                      Broken images fixed successfully!
                    </AlertDescription>
                  </Alert>
                )}

                {fixBrokenImagesMutation.isError && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      {fixBrokenImagesMutation.error?.message || "Failed to fix broken images. Check API keys."}
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="h-5 w-5" />
                  Database Backup
                </CardTitle>
                <CardDescription>
                  Export or import database for syncing between development environments
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Button
                    className="w-full gap-2"
                    variant="outline"
                    onClick={() => {
                      window.location.href = '/api/admin/database/export';
                    }}
                    data-testid="button-export-database"
                  >
                    <Download className="h-4 w-4" />
                    Export Database (JSON)
                  </Button>
                  <p className="text-xs text-muted-foreground mt-2">
                    Downloads all products and leads as a JSON backup file
                  </p>
                </div>
                
                <div className="relative my-3">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">or</span>
                  </div>
                </div>
                
                <DatabaseImportForm />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <LogOut className="h-5 w-5" />
                  Session Management
                </CardTitle>
                <CardDescription>
                  Force all users to log out and re-authenticate
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Use this after changing user roles or if users are experiencing authentication issues. Everyone (including you) will need to log in again.
                </p>
                <ForceLogoutButton />
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
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}

function DatabaseImportForm() {
  const [file, setFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const importMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      return await apiRequest('POST', '/api/admin/database/import', formData) as {
        success: boolean;
        message: string;
        importedProducts: number;
        importedLeads: number;
      };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/products'] });
      queryClient.invalidateQueries({ queryKey: ['/api/leads'] });
      toast({
        title: "Import Successful",
        description: data.message,
      });
      setFile(null);
      if (inputRef.current) inputRef.current.value = '';
    },
    onError: (error: Error) => {
      toast({
        title: "Import Failed",
        description: error.message || "Failed to import database backup.",
        variant: "destructive",
      });
    },
  });

  const handleImport = () => {
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    importMutation.mutate(formData);
  };

  return (
    <div className="space-y-3">
      <Label>Import Backup File</Label>
      <Input
        ref={inputRef}
        type="file"
        accept=".json"
        onChange={(e) => setFile(e.target.files?.[0] || null)}
        data-testid="input-import-file"
      />
      <Button
        className="w-full gap-2"
        onClick={handleImport}
        disabled={!file || importMutation.isPending}
        data-testid="button-import-database"
      >
        {importMutation.isPending ? (
          <>
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-foreground" />
            Importing...
          </>
        ) : (
          <>
            <Upload className="h-4 w-4" />
            Import Database Backup
          </>
        )}
      </Button>
      <p className="text-xs text-destructive">
        Warning: This will replace all existing products and leads!
      </p>
    </div>
  );
}

function ForceLogoutButton() {
  const { toast } = useToast();
  const [confirming, setConfirming] = useState(false);

  const forceLogoutMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', '/api/admin/force-logout-all') as { success: boolean; message: string };
    },
    onSuccess: (data) => {
      toast({
        title: "Sessions Cleared",
        description: data.message,
      });
      setTimeout(() => {
        window.location.href = "/api/login";
      }, 1500);
    },
    onError: (error: any) => {
      toast({
        title: "Failed",
        description: error?.message || "Could not clear sessions.",
        variant: "destructive",
      });
      setConfirming(false);
    },
  });

  if (confirming) {
    return (
      <div className="flex gap-2">
        <Button
          variant="destructive"
          className="flex-1 gap-2"
          onClick={() => {
            forceLogoutMutation.mutate();
            setConfirming(false);
          }}
          disabled={forceLogoutMutation.isPending}
          data-testid="button-confirm-force-logout"
        >
          {forceLogoutMutation.isPending ? (
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-foreground" />
          ) : (
            <LogOut className="h-4 w-4" />
          )}
          Yes, Log Out Everyone
        </Button>
        <Button
          variant="outline"
          className="flex-1"
          onClick={() => setConfirming(false)}
          data-testid="button-cancel-force-logout"
        >
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <Button
      variant="outline"
      className="w-full gap-2"
      onClick={() => setConfirming(true)}
      data-testid="button-force-logout-all"
    >
      <LogOut className="h-4 w-4" />
      Force Logout All Users
    </Button>
  );
}
