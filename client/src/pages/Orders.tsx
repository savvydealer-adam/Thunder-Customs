import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Mail, Phone, Calendar, Package, Loader2, Search, User, Trash2, Car, Plus, ShoppingCart } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Redirect, Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { useCart } from "@/contexts/CartContext";

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

const statusLabels: Record<string, string> = {
  pending: "Pending",
  processing: "Processing",
  completed: "Completed",
  cancelled: "Cancelled",
};

export default function Orders() {
  const { isAuthenticated, isLoading: isAuthLoading, user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { items: cartItems, clearCart } = useCart();
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newOrderData, setNewOrderData] = useState({
    customerName: "",
    customerEmail: "",
    customerPhone: "",
    vehicleInfo: "",
    notes: "",
  });

  const { data: orders, isLoading } = useQuery<Order[]>({
    queryKey: ['/api/orders', statusFilter, searchQuery],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (searchQuery) params.set('search', searchQuery);
      const response = await fetch(`/api/orders?${params.toString()}`, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch orders');
      return response.json();
    },
    enabled: isAuthenticated,
  });

  const { data: stats } = useQuery<{ status: string; count: number }[]>({
    queryKey: ['/api/orders/stats'],
    enabled: isAuthenticated,
  });

  const createOrderMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest('POST', '/api/orders', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
      queryClient.invalidateQueries({ queryKey: ['/api/orders/stats'] });
      setCreateDialogOpen(false);
      setNewOrderData({ customerName: "", customerEmail: "", customerPhone: "", vehicleInfo: "", notes: "" });
      clearCart();
      toast({
        title: "Order Created",
        description: "Order has been created successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Creation Failed",
        description: "Failed to create order.",
        variant: "destructive",
      });
    },
  });

  const updateOrderMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      return await apiRequest('PATCH', `/api/orders/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
      queryClient.invalidateQueries({ queryKey: ['/api/orders/stats'] });
      toast({
        title: "Order Updated",
        description: "Order has been updated successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Update Failed",
        description: "Failed to update order.",
        variant: "destructive",
      });
    },
  });

  const deleteOrderMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest('DELETE', `/api/orders/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
      queryClient.invalidateQueries({ queryKey: ['/api/orders/stats'] });
      setSelectedOrder(null);
      toast({
        title: "Order Deleted",
        description: "Order has been removed.",
      });
    },
    onError: () => {
      toast({
        title: "Delete Failed",
        description: "Failed to delete order.",
        variant: "destructive",
      });
    },
  });

  const handleCreateOrder = () => {
    if (!newOrderData.customerName.trim()) {
      toast({
        title: "Customer Name Required",
        description: "Please enter a customer name.",
        variant: "destructive",
      });
      return;
    }

    if (cartItems.length === 0) {
      toast({
        title: "No Items in Cart",
        description: "Add items to the cart before creating an order.",
        variant: "destructive",
      });
      return;
    }

    const cartTotal = cartItems.reduce((sum, item) => {
      const price = item.product.totalRetail || item.product.partMSRP || item.product.price;
      return sum + (price ? parseFloat(price) * item.quantity : 0);
    }, 0).toFixed(2);

    createOrderMutation.mutate({
      customerName: newOrderData.customerName.trim(),
      customerEmail: newOrderData.customerEmail.trim() || null,
      customerPhone: newOrderData.customerPhone.trim() || null,
      vehicleInfo: newOrderData.vehicleInfo.trim() || null,
      notes: newOrderData.notes.trim() || null,
      cartItems: cartItems.map(item => ({
        product: {
          id: item.product.id,
          partNumber: item.product.partNumber,
          partName: item.product.partName,
          manufacturer: item.product.manufacturer,
          category: item.product.category,
          price: item.product.totalRetail || item.product.partMSRP || item.product.price || null,
        },
        quantity: item.quantity,
      })),
      cartTotal,
    });
  };

  const getStatCount = (status: string) => {
    if (!stats) return 0;
    const stat = stats.find(s => s.status === status);
    return stat?.count || 0;
  };

  const totalOrders = stats?.reduce((sum, s) => sum + s.count, 0) || 0;

  if (isAuthLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Redirect to="/" />;
  }

  return (
    <div className="min-h-screen">
      <main className="container mx-auto px-4 py-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold" data-testid="text-orders-title">Customer Orders</h1>
            <p className="text-muted-foreground mt-2">
              Orders created on behalf of customers by sales staff
            </p>
          </div>
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-create-order">
                <Plus className="h-4 w-4 mr-2" />
                Create Order
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Create New Order</DialogTitle>
                <DialogDescription>
                  Enter customer details to create an order from the current cart items.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="customerName">Customer Name *</Label>
                  <Input
                    id="customerName"
                    placeholder="Enter customer name"
                    value={newOrderData.customerName}
                    onChange={(e) => setNewOrderData(prev => ({ ...prev, customerName: e.target.value }))}
                    data-testid="input-customer-name"
                  />
                </div>
                <div>
                  <Label htmlFor="customerEmail">Email</Label>
                  <Input
                    id="customerEmail"
                    type="email"
                    placeholder="customer@example.com"
                    value={newOrderData.customerEmail}
                    onChange={(e) => setNewOrderData(prev => ({ ...prev, customerEmail: e.target.value }))}
                    data-testid="input-customer-email"
                  />
                </div>
                <div>
                  <Label htmlFor="customerPhone">Phone</Label>
                  <Input
                    id="customerPhone"
                    placeholder="(555) 555-5555"
                    value={newOrderData.customerPhone}
                    onChange={(e) => setNewOrderData(prev => ({ ...prev, customerPhone: e.target.value }))}
                    data-testid="input-customer-phone"
                  />
                </div>
                <div>
                  <Label htmlFor="vehicleInfo">Vehicle Information</Label>
                  <Input
                    id="vehicleInfo"
                    placeholder="Year Make Model"
                    value={newOrderData.vehicleInfo}
                    onChange={(e) => setNewOrderData(prev => ({ ...prev, vehicleInfo: e.target.value }))}
                    data-testid="input-vehicle-info"
                  />
                </div>
                <div>
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    placeholder="Additional order notes..."
                    value={newOrderData.notes}
                    onChange={(e) => setNewOrderData(prev => ({ ...prev, notes: e.target.value }))}
                    data-testid="input-order-notes"
                  />
                </div>

                <div className="bg-muted p-3 rounded-md">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium flex items-center gap-2">
                      <ShoppingCart className="h-4 w-4" />
                      Cart Items ({cartItems.length})
                    </span>
                    <Link href="/products" className="text-sm text-primary hover:underline">
                      Browse Products
                    </Link>
                  </div>
                  {cartItems.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No items in cart. Add products first.</p>
                  ) : (
                    <div className="space-y-1 max-h-32 overflow-y-auto text-sm">
                      {cartItems.map((item, idx) => (
                        <div key={idx} className="flex justify-between">
                          <span>{item.product.partName}</span>
                          <span>x{item.quantity}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <Button 
                  onClick={handleCreateOrder} 
                  disabled={createOrderMutation.isPending || cartItems.length === 0}
                  className="w-full"
                  data-testid="button-submit-order"
                >
                  {createOrderMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4 mr-2" />
                  )}
                  Create Order
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="flex flex-col md:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by customer name, email, or phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
              data-testid="input-order-search"
            />
          </div>
        </div>

        <Tabs value={statusFilter} onValueChange={setStatusFilter} className="mb-6">
          <TabsList className="flex-wrap">
            <TabsTrigger value="all" data-testid="tab-all">
              All ({totalOrders})
            </TabsTrigger>
            <TabsTrigger value="pending" data-testid="tab-pending">
              Pending ({getStatCount('pending')})
            </TabsTrigger>
            <TabsTrigger value="processing" data-testid="tab-processing">
              Processing ({getStatCount('processing')})
            </TabsTrigger>
            <TabsTrigger value="completed" data-testid="tab-completed">
              Completed ({getStatCount('completed')})
            </TabsTrigger>
            <TabsTrigger value="cancelled" data-testid="tab-cancelled">
              Cancelled ({getStatCount('cancelled')})
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : !orders || orders.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Orders Found</h3>
              <p className="text-muted-foreground">
                {searchQuery || statusFilter !== 'all' 
                  ? "No orders match your current filters." 
                  : "Create orders for customers using the button above."}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {orders.map((order) => (
              <Card key={order.id} className="hover-elevate cursor-pointer" onClick={() => setSelectedOrder(order)}>
                <CardContent className="p-4">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-semibold text-lg" data-testid={`text-order-name-${order.id}`}>
                          {order.customerName}
                        </h3>
                        <Badge className={statusColors[order.status]} data-testid={`badge-status-${order.id}`}>
                          {statusLabels[order.status] || order.status}
                        </Badge>
                        {order.createdByName && (
                          <Badge variant="outline" className="gap-1">
                            <User className="h-3 w-3" />
                            {order.createdByName}
                          </Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                        {order.customerEmail && (
                          <span className="flex items-center gap-1">
                            <Mail className="h-4 w-4" />
                            {order.customerEmail}
                          </span>
                        )}
                        {order.customerPhone && (
                          <span className="flex items-center gap-1">
                            <Phone className="h-4 w-4" />
                            {order.customerPhone}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Package className="h-4 w-4" />
                          {order.itemCount} item(s)
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="h-4 w-4" />
                          {format(new Date(order.createdAt), "MMM d, yyyy 'at' h:mm a")}
                        </span>
                      </div>
                      {order.vehicleInfo && (
                        <p className="text-sm text-muted-foreground mt-2 flex items-center gap-1">
                          <Car className="h-4 w-4" />
                          {order.vehicleInfo}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {order.cartTotal && (
                        <span className="font-semibold text-lg">${parseFloat(order.cartTotal).toFixed(2)}</span>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Dialog open={!!selectedOrder} onOpenChange={(open) => !open && setSelectedOrder(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            {selectedOrder && (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-3">
                    {selectedOrder.customerName}
                    <Badge className={statusColors[selectedOrder.status]}>
                      {statusLabels[selectedOrder.status] || selectedOrder.status}
                    </Badge>
                  </DialogTitle>
                  <DialogDescription>
                    Created {format(new Date(selectedOrder.createdAt), "MMMM d, yyyy 'at' h:mm a")}
                    {selectedOrder.createdByName && ` by ${selectedOrder.createdByName}`}
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    {selectedOrder.customerEmail && (
                      <div>
                        <p className="text-sm text-muted-foreground">Email</p>
                        <p className="font-medium">{selectedOrder.customerEmail}</p>
                      </div>
                    )}
                    {selectedOrder.customerPhone && (
                      <div>
                        <p className="text-sm text-muted-foreground">Phone</p>
                        <p className="font-medium">{selectedOrder.customerPhone}</p>
                      </div>
                    )}
                    {selectedOrder.vehicleInfo && (
                      <div>
                        <p className="text-sm text-muted-foreground">Vehicle</p>
                        <p className="font-medium">{selectedOrder.vehicleInfo}</p>
                      </div>
                    )}
                  </div>

                  {selectedOrder.notes && (
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Notes</p>
                      <p className="text-sm bg-muted p-3 rounded-md">{selectedOrder.notes}</p>
                    </div>
                  )}

                  <div className="border-t pt-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-semibold">Order Items ({selectedOrder.itemCount})</h4>
                      {selectedOrder.cartTotal && (
                        <span className="font-semibold text-lg">${parseFloat(selectedOrder.cartTotal).toFixed(2)}</span>
                      )}
                    </div>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {selectedOrder.cartItems.map((item: any, index: number) => (
                        <div key={index} className="flex justify-between items-center text-sm bg-muted p-2 rounded">
                          <div>
                            <p className="font-medium">{item.product.partName}</p>
                            <p className="text-muted-foreground">
                              {item.product.partNumber} · {item.product.manufacturer}
                            </p>
                          </div>
                          <div className="text-right">
                            <p>Qty: {item.quantity}</p>
                            {item.product.price && (
                              <p className="text-muted-foreground">${item.product.price}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="border-t pt-4">
                    <div className="flex flex-wrap gap-3">
                      <div className="flex-1 min-w-[200px]">
                        <p className="text-sm text-muted-foreground mb-2">Update Status</p>
                        <Select 
                          value={selectedOrder.status} 
                          onValueChange={(status) => updateOrderMutation.mutate({ id: selectedOrder.id, data: { status } })}
                        >
                          <SelectTrigger data-testid="select-order-status">
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
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {selectedOrder.customerEmail && (
                      <Button 
                        variant="outline" 
                        onClick={() => window.location.href = `mailto:${selectedOrder.customerEmail}`}
                        data-testid="button-email-customer"
                      >
                        <Mail className="h-4 w-4 mr-2" />
                        Email
                      </Button>
                    )}
                    {selectedOrder.customerPhone && (
                      <Button 
                        variant="outline" 
                        onClick={() => window.location.href = `tel:${selectedOrder.customerPhone}`}
                        data-testid="button-call-customer"
                      >
                        <Phone className="h-4 w-4 mr-2" />
                        Call
                      </Button>
                    )}
                    <Button 
                      variant="destructive" 
                      onClick={() => deleteOrderMutation.mutate(selectedOrder.id)}
                      disabled={deleteOrderMutation.isPending}
                      data-testid="button-delete-order"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </Button>
                  </div>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
