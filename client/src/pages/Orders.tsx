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
import { Mail, Phone, Calendar, Package, Loader2, Search, User, Trash2, Car, Plus, ShoppingCart, Pencil, Save, X, Download, ChevronLeft, ChevronRight } from "lucide-react";
import { generateOrderPDF } from "@/lib/pdfGenerator";
import { useAuth } from "@/hooks/useAuth";
import { Redirect, Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { useCart } from "@/contexts/CartContext";
import { TAX_RATE, TAX_RATE_DISPLAY, TAX_JURISDICTION, calculateTax } from "@shared/taxConfig";

interface Order {
  id: number;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  vehicleInfo: string | null;
  notes: string | null;
  cartItems: any[];
  cartTotal: string | null;
  taxRate: string | null;
  taxAmount: string | null;
  itemCount: number;
  status: string;
  createdBy: string;
  createdByName: string | null;
  assignedTo: string | null;
  createdAt: string;
  completedAt: string | null;
}

interface PaginatedOrders {
  orders: Order[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
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
  const { isAuthenticated, isLoading: isAuthLoading, user, isStaff, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { items: cartItems, clearCart } = useCart();
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [isEditing, setIsEditing] = useState(false);
  const [editableItems, setEditableItems] = useState<any[]>([]);
  const [showAddItem, setShowAddItem] = useState(false);
  const [newItem, setNewItem] = useState({
    partName: "",
    partNumber: "",
    manufacturer: "",
    price: "",
    quantity: 1,
  });
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newOrderData, setNewOrderData] = useState({
    customerName: "",
    customerEmail: "",
    customerPhone: "",
    vehicleInfo: "",
    notes: "",
  });
  // State for editing items in create order dialog
  const [createOrderItems, setCreateOrderItems] = useState<any[]>([]);
  const [showCreateAddItem, setShowCreateAddItem] = useState(false);
  const [createNewItem, setCreateNewItem] = useState({
    partName: "",
    partNumber: "",
    manufacturer: "",
    price: "",
    quantity: 1,
  });

  const { data, isLoading } = useQuery<PaginatedOrders>({
    queryKey: ['/api/orders', statusFilter, searchQuery, currentPage],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (searchQuery) params.set('search', searchQuery);
      params.set('page', String(currentPage));
      params.set('pageSize', '50');
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

  // Initialize createOrderItems when dialog opens
  const openCreateDialog = () => {
    setCreateOrderItems(cartItems.map(item => ({
      product: {
        id: item.product.id,
        partNumber: item.product.partNumber,
        partName: item.product.partName,
        manufacturer: item.product.manufacturer,
        category: item.product.category,
        price: String(item.product.totalRetail || item.product.partMSRP || item.product.price || ""),
      },
      quantity: item.quantity,
    })));
    setCreateDialogOpen(true);
  };

  const handleCreateOrder = () => {
    if (!newOrderData.customerName.trim()) {
      toast({
        title: "Customer Name Required",
        description: "Please enter a customer name.",
        variant: "destructive",
      });
      return;
    }

    if (createOrderItems.length === 0) {
      toast({
        title: "No Items",
        description: "Add at least one item to the order.",
        variant: "destructive",
      });
      return;
    }

    const parsePrice = (priceStr: string | number | null | undefined): number => {
      if (!priceStr) return 0;
      const cleaned = String(priceStr).replace(/[^0-9.-]/g, '');
      const parsed = parseFloat(cleaned);
      return isNaN(parsed) ? 0 : parsed;
    };

    const subtotal = createOrderItems.reduce((sum, item) => {
      const price = parsePrice(item.product.price);
      return sum + (price * item.quantity);
    }, 0);
    const taxAmount = calculateTax(subtotal);
    const cartTotal = (subtotal + taxAmount).toFixed(2);

    createOrderMutation.mutate({
      customerName: newOrderData.customerName.trim(),
      customerEmail: newOrderData.customerEmail.trim() || null,
      customerPhone: newOrderData.customerPhone.trim() || null,
      vehicleInfo: newOrderData.vehicleInfo.trim() || null,
      notes: newOrderData.notes.trim() || null,
      cartItems: createOrderItems.map(item => ({
        product: {
          id: item.product.id || null,
          partNumber: item.product.partNumber,
          partName: item.product.partName,
          manufacturer: item.product.manufacturer,
          category: item.product.category || "Custom",
          price: item.product.price ? String(item.product.price) : null,
        },
        quantity: item.quantity,
      })),
      cartTotal,
      taxRate: String(TAX_RATE),
      taxAmount: taxAmount.toFixed(2),
      itemCount: createOrderItems.reduce((sum, item) => sum + item.quantity, 0),
    });
  };

  // Functions for managing create order items
  const updateCreateItemQuantity = (index: number, quantity: number) => {
    const updated = [...createOrderItems];
    updated[index].quantity = Math.max(1, quantity);
    setCreateOrderItems(updated);
  };

  const updateCreateItemPrice = (index: number, price: string) => {
    const updated = [...createOrderItems];
    updated[index].product = { ...updated[index].product, price };
    setCreateOrderItems(updated);
  };

  const removeCreateItem = (index: number) => {
    setCreateOrderItems(createOrderItems.filter((_, i) => i !== index));
  };

  const addCreateCustomItem = () => {
    if (!createNewItem.partName.trim()) {
      toast({
        title: "Part Name Required",
        description: "Please enter a part name.",
        variant: "destructive",
      });
      return;
    }

    setCreateOrderItems([...createOrderItems, {
      product: {
        id: null,
        partNumber: createNewItem.partNumber.trim() || "CUSTOM",
        partName: createNewItem.partName.trim(),
        manufacturer: createNewItem.manufacturer.trim() || "Custom",
        category: "Custom",
        price: createNewItem.price,
      },
      quantity: createNewItem.quantity,
    }]);

    setCreateNewItem({ partName: "", partNumber: "", manufacturer: "", price: "", quantity: 1 });
    setShowCreateAddItem(false);
  };

  const calculateCreateSubtotal = () => {
    const parsePrice = (priceStr: string | number | null | undefined): number => {
      if (!priceStr) return 0;
      const cleaned = String(priceStr).replace(/[^0-9.-]/g, '');
      const parsed = parseFloat(cleaned);
      return isNaN(parsed) ? 0 : parsed;
    };
    return createOrderItems.reduce((sum, item) => {
      return sum + (parsePrice(item.product.price) * item.quantity);
    }, 0);
  };

  const getStatCount = (status: string) => {
    if (!stats) return 0;
    const stat = stats.find(s => s.status === status);
    return stat?.count || 0;
  };

  const totalOrders = stats?.reduce((sum, s) => sum + s.count, 0) || 0;

  const startEditing = () => {
    if (selectedOrder) {
      setEditableItems(selectedOrder.cartItems.map((item: any) => ({
        ...item,
        product: { ...item.product },
      })));
      setIsEditing(true);
    }
  };

  const cancelEditing = (closeDialog: boolean = false) => {
    setIsEditing(false);
    setEditableItems([]);
    setShowAddItem(false);
    setNewItem({ partName: "", partNumber: "", manufacturer: "", price: "", quantity: 1 });
    if (closeDialog) {
      setSelectedOrder(null);
    }
  };

  const updateItemQuantity = (index: number, quantity: number) => {
    const updated = [...editableItems];
    updated[index].quantity = Math.max(1, quantity);
    setEditableItems(updated);
  };

  const updateItemPrice = (index: number, price: string) => {
    const updated = [...editableItems];
    updated[index].product.price = price;
    setEditableItems(updated);
  };

  const removeItem = (index: number) => {
    setEditableItems(editableItems.filter((_, i) => i !== index));
  };

  const addCustomItem = () => {
    if (!newItem.partName.trim()) {
      toast({ title: "Name Required", description: "Please enter a product name.", variant: "destructive" });
      return;
    }
    const customItem = {
      product: {
        id: null,
        partNumber: newItem.partNumber.trim() || `CUSTOM-${Date.now()}`,
        partName: newItem.partName.trim(),
        manufacturer: newItem.manufacturer.trim() || "Custom",
        category: "Custom",
        price: newItem.price || null,
      },
      quantity: newItem.quantity,
    };
    setEditableItems([...editableItems, customItem]);
    setNewItem({ partName: "", partNumber: "", manufacturer: "", price: "", quantity: 1 });
    setShowAddItem(false);
  };

  const calculateTotal = (items: any[]) => {
    return items.reduce((sum, item) => {
      const price = parseFloat(item.product.price) || 0;
      return sum + (price * item.quantity);
    }, 0).toFixed(2);
  };

  const saveOrderChanges = () => {
    if (!selectedOrder) return;
    
    const normalizedItems = editableItems.map(item => ({
      ...item,
      quantity: Number(item.quantity) || 1,
      product: {
        ...item.product,
        price: item.product.price ? String(item.product.price) : null,
      }
    }));
    
    const subtotal = parseFloat(calculateTotal(normalizedItems));
    const taxAmount = calculateTax(subtotal);
    const cartTotal = (subtotal + taxAmount).toFixed(2);
    const itemCount = normalizedItems.reduce((sum, item) => sum + item.quantity, 0);
    
    updateOrderMutation.mutate({
      id: selectedOrder.id,
      data: {
        cartItems: normalizedItems,
        cartTotal,
        taxRate: String(TAX_RATE),
        taxAmount: taxAmount.toFixed(2),
        itemCount,
      }
    }, {
      onSuccess: () => {
        setSelectedOrder({
          ...selectedOrder,
          cartItems: normalizedItems,
          cartTotal,
          taxRate: String(TAX_RATE),
          taxAmount: taxAmount.toFixed(2),
          itemCount,
        });
        setIsEditing(false);
        setEditableItems([]);
        setShowAddItem(false);
      }
    });
  };

  if (isAuthLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated || !isStaff) {
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
          <Button onClick={openCreateDialog} data-testid="button-create-order">
              <Plus className="h-4 w-4 mr-2" />
              Create Order
            </Button>
          <Dialog open={createDialogOpen} onOpenChange={(open) => {
            if (!open) {
              setShowCreateAddItem(false);
              setCreateNewItem({ partName: "", partNumber: "", manufacturer: "", price: "", quantity: 1 });
            }
            setCreateDialogOpen(open);
          }}>
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

                <div className="border rounded-md p-3">
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-medium flex items-center gap-2">
                      <ShoppingCart className="h-4 w-4" />
                      Order Items ({createOrderItems.length})
                    </span>
                  </div>
                  
                  {createOrderItems.length === 0 ? (
                    <p className="text-sm text-muted-foreground mb-3">No items yet. Add products from catalog{isAdmin && " or custom items"} below.</p>
                  ) : (
                    <div className="space-y-2 max-h-48 overflow-y-auto mb-3">
                      {createOrderItems.map((item, idx) => (
                        <div key={idx} className="flex items-center gap-2 bg-muted p-2 rounded text-sm">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{item.product.partName}</p>
                            <p className="text-xs text-muted-foreground">{item.product.partNumber}</p>
                          </div>
                          {isAdmin ? (
                            <>
                              <Input
                                type="number"
                                min={1}
                                value={item.quantity}
                                onChange={(e) => updateCreateItemQuantity(idx, parseInt(e.target.value) || 1)}
                                className="w-16 h-8 text-center"
                                data-testid={`input-create-qty-${idx}`}
                              />
                              <div className="flex items-center gap-1">
                                <span className="text-xs">$</span>
                                <Input
                                  type="text"
                                  value={item.product.price}
                                  onChange={(e) => updateCreateItemPrice(idx, e.target.value)}
                                  placeholder="0.00"
                                  className="w-20 h-8"
                                  data-testid={`input-create-price-${idx}`}
                                />
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive"
                                onClick={() => removeCreateItem(idx)}
                                data-testid={`button-remove-create-item-${idx}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          ) : (
                            <div className="text-right">
                              <span className="text-sm">x{item.quantity}</span>
                              {item.product.price && (
                                <span className="text-sm text-muted-foreground ml-2">${item.product.price}</span>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {isAdmin && showCreateAddItem ? (
                    <div className="space-y-2 border-t pt-3">
                      <p className="text-sm font-medium">Add Custom Product</p>
                      <Input
                        placeholder="Part Name *"
                        value={createNewItem.partName}
                        onChange={(e) => setCreateNewItem({ ...createNewItem, partName: e.target.value })}
                        data-testid="input-create-custom-name"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <Input
                          placeholder="Part Number"
                          value={createNewItem.partNumber}
                          onChange={(e) => setCreateNewItem({ ...createNewItem, partNumber: e.target.value })}
                          data-testid="input-create-custom-partnumber"
                        />
                        <Input
                          placeholder="Manufacturer"
                          value={createNewItem.manufacturer}
                          onChange={(e) => setCreateNewItem({ ...createNewItem, manufacturer: e.target.value })}
                          data-testid="input-create-custom-manufacturer"
                        />
                      </div>
                      <div className="flex gap-2 items-center">
                        <div className="flex items-center gap-1 flex-1">
                          <span className="text-sm">$</span>
                          <Input
                            placeholder="Price"
                            value={createNewItem.price}
                            onChange={(e) => setCreateNewItem({ ...createNewItem, price: e.target.value })}
                            data-testid="input-create-custom-price"
                          />
                        </div>
                        <Input
                          type="number"
                          min={1}
                          placeholder="Qty"
                          value={createNewItem.quantity}
                          onChange={(e) => setCreateNewItem({ ...createNewItem, quantity: parseInt(e.target.value) || 1 })}
                          className="w-20"
                          data-testid="input-create-custom-qty"
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={addCreateCustomItem} data-testid="button-add-create-custom">
                          Add Item
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setShowCreateAddItem(false)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2 border-t pt-3">
                      {isAdmin && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() => setShowCreateAddItem(true)}
                          data-testid="button-show-create-add-item"
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Add Custom Product
                        </Button>
                      )}
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className={isAdmin ? "flex-1" : "w-full"}
                        onClick={() => {
                          setCreateDialogOpen(false);
                          window.location.href = "/products";
                        }}
                      >
                        <ShoppingCart className="h-4 w-4 mr-1" />
                        Browse Catalog
                      </Button>
                    </div>
                  )}
                </div>

                {createOrderItems.length > 0 && (() => {
                  const subtotal = calculateCreateSubtotal();
                  const tax = calculateTax(subtotal);
                  return (
                    <div className="border rounded-md p-3 space-y-1" data-testid="order-tax-summary">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Subtotal</span>
                        <span>${subtotal.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{TAX_JURISDICTION} Tax ({TAX_RATE_DISPLAY})</span>
                        <span>${tax.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between font-semibold border-t pt-1">
                        <span>Total</span>
                        <span>${(subtotal + tax).toFixed(2)}</span>
                      </div>
                    </div>
                  );
                })()}

                <Button 
                  onClick={handleCreateOrder} 
                  disabled={createOrderMutation.isPending || createOrderItems.length === 0}
                  className="w-full"
                  data-testid="button-submit-order"
                >
                  {createOrderMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Create Order ({createOrderItems.length} items)
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
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              className="pl-10"
              data-testid="input-order-search"
            />
          </div>
        </div>

        <Tabs value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setCurrentPage(1); }} className="mb-6">
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
        ) : !data?.orders || data.orders.length === 0 ? (
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
          <>
            <div className="grid gap-4">
            {data.orders.map((order) => (
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
                    <div className="flex flex-col items-end gap-0.5">
                      {order.cartTotal && (
                        <span className="font-semibold text-lg" data-testid={`text-order-total-${order.id}`}>${parseFloat(order.cartTotal).toFixed(2)}</span>
                      )}
                      {order.taxAmount && (
                        <span className="text-xs text-muted-foreground">incl. ${parseFloat(order.taxAmount).toFixed(2)} tax</span>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
            {data && data.totalPages > 1 && (
              <div className="flex items-center justify-center gap-4 mt-6">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  data-testid="button-prev-page"
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {data.page} of {data.totalPages} ({data.total} total)
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.min(data.totalPages, p + 1))}
                  disabled={currentPage === data.totalPages}
                  data-testid="button-next-page"
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            )}
          </>
        )}

        <Dialog open={!!selectedOrder} onOpenChange={(open) => { 
          if (!open && isEditing) {
            if (window.confirm("You have unsaved changes. Discard them?")) {
              cancelEditing();
              setSelectedOrder(null);
            }
            return;
          }
          if (!open) {
            setSelectedOrder(null);
          }
        }}>
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
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-fit mt-2"
                    onClick={() => generateOrderPDF(selectedOrder)}
                    data-testid="button-download-order-pdf"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download PDF
                  </Button>
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
                      <h4 className="font-semibold">
                        Order Items ({isEditing ? editableItems.length : selectedOrder.itemCount})
                      </h4>
                      <div className="flex items-center gap-2">
                        {!isEditing && isAdmin && (
                          <Button variant="outline" size="sm" onClick={startEditing} data-testid="button-edit-order">
                            <Pencil className="h-4 w-4 mr-1" />
                            Edit
                          </Button>
                        )}
                      </div>
                    </div>
                    
                    {isEditing ? (
                      <div className="space-y-2">
                        {editableItems.map((item: any, index: number) => (
                          <div key={index} className="flex items-center gap-2 text-sm bg-muted p-2 rounded">
                            <div className="flex-1 min-w-0">
                              <p className="font-medium truncate">{item.product.partName}</p>
                              <p className="text-muted-foreground text-xs truncate">
                                {item.product.partNumber} · {item.product.manufacturer}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-16">
                                <Input
                                  type="number"
                                  min="1"
                                  value={item.quantity}
                                  onChange={(e) => updateItemQuantity(index, parseInt(e.target.value) || 1)}
                                  className="h-8 text-center"
                                  data-testid={`input-qty-${index}`}
                                />
                              </div>
                              <div className="w-24">
                                <Input
                                  type="text"
                                  placeholder="Price"
                                  value={item.product.price || ""}
                                  onChange={(e) => updateItemPrice(index, e.target.value)}
                                  className="h-8"
                                  data-testid={`input-price-${index}`}
                                />
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive"
                                onClick={() => removeItem(index)}
                                data-testid={`button-remove-${index}`}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                        
                        {showAddItem ? (
                          <div className="border rounded-md p-3 space-y-2 bg-background">
                            <p className="font-medium text-sm">Add Custom Product</p>
                            <div className="grid grid-cols-2 gap-2">
                              <Input
                                placeholder="Product Name *"
                                value={newItem.partName}
                                onChange={(e) => setNewItem({ ...newItem, partName: e.target.value })}
                                data-testid="input-new-item-name"
                              />
                              <Input
                                placeholder="Part Number"
                                value={newItem.partNumber}
                                onChange={(e) => setNewItem({ ...newItem, partNumber: e.target.value })}
                                data-testid="input-new-item-number"
                              />
                              <Input
                                placeholder="Manufacturer"
                                value={newItem.manufacturer}
                                onChange={(e) => setNewItem({ ...newItem, manufacturer: e.target.value })}
                                data-testid="input-new-item-manufacturer"
                              />
                              <Input
                                placeholder="Price"
                                value={newItem.price}
                                onChange={(e) => setNewItem({ ...newItem, price: e.target.value })}
                                data-testid="input-new-item-price"
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              <Input
                                type="number"
                                min="1"
                                value={newItem.quantity}
                                onChange={(e) => setNewItem({ ...newItem, quantity: parseInt(e.target.value) || 1 })}
                                className="w-20"
                                data-testid="input-new-item-qty"
                              />
                              <Button size="sm" onClick={addCustomItem} data-testid="button-add-custom-item">
                                Add Item
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => setShowAddItem(false)}>
                                Cancel
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full"
                            onClick={() => setShowAddItem(true)}
                            data-testid="button-show-add-item"
                          >
                            <Plus className="h-4 w-4 mr-1" />
                            Add Custom Product
                          </Button>
                        )}
                        
                        <div className="flex gap-2 pt-2">
                          <Button onClick={saveOrderChanges} disabled={updateOrderMutation.isPending} data-testid="button-save-order">
                            <Save className="h-4 w-4 mr-1" />
                            {updateOrderMutation.isPending ? "Saving..." : "Save Changes"}
                          </Button>
                          <Button variant="outline" onClick={() => cancelEditing()}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
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
                    )}

                    {selectedOrder.cartTotal && (
                      <div className="mt-3 space-y-1 pt-2 border-t" data-testid="order-detail-tax-summary">
                        {selectedOrder.taxAmount ? (
                          <>
                            <div className="flex justify-between text-sm">
                              <span className="text-muted-foreground">Subtotal</span>
                              <span>${(parseFloat(selectedOrder.cartTotal) - parseFloat(selectedOrder.taxAmount)).toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                              <span className="text-muted-foreground">
                                {TAX_JURISDICTION} Tax ({selectedOrder.taxRate ? `${(parseFloat(selectedOrder.taxRate) * 100).toFixed(0)}%` : TAX_RATE_DISPLAY})
                              </span>
                              <span>${parseFloat(selectedOrder.taxAmount).toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between font-semibold text-lg border-t pt-1">
                              <span>Total</span>
                              <span>${parseFloat(selectedOrder.cartTotal).toFixed(2)}</span>
                            </div>
                          </>
                        ) : (
                          <div className="flex justify-between font-semibold text-lg">
                            <span>Total</span>
                            <span>${parseFloat(selectedOrder.cartTotal).toFixed(2)}</span>
                          </div>
                        )}
                      </div>
                    )}
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
