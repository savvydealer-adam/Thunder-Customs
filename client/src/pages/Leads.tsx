import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Download, Mail, Phone, Calendar, Package, Loader2, Search, User, Trash2, MessageSquare, Car, ChevronLeft, ChevronRight } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Redirect } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface Lead {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  preferredContact: string | null;
  vehicleInfo: string | null;
  comments: string | null;
  cartItems: any[];
  cartTotal: string | null;
  itemCount: number;
  status: string;
  assignedTo: string | null;
  createdAt: string;
  contactedAt: string | null;
}

interface PaginatedLeads {
  leads: Lead[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

const statusColors: Record<string, string> = {
  new: "bg-blue-500",
  contacted: "bg-yellow-500",
  quoted: "bg-purple-500",
  sold: "bg-green-500",
  closed: "bg-gray-500",
};

const statusLabels: Record<string, string> = {
  new: "New",
  contacted: "Contacted",
  quoted: "Quoted",
  sold: "Sold",
  closed: "Closed",
};

export default function Leads() {
  const { isAuthenticated, isLoading: isAuthLoading, user, isAdmin, isStaff } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  const { data, isLoading } = useQuery<PaginatedLeads>({
    queryKey: ['/api/leads', statusFilter, searchQuery, currentPage],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (searchQuery) params.set('search', searchQuery);
      params.set('page', String(currentPage));
      params.set('pageSize', '50');
      const response = await fetch(`/api/leads?${params.toString()}`, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch leads');
      return response.json();
    },
    enabled: isAuthenticated,
  });

  const { data: stats } = useQuery<{ status: string; count: number }[]>({
    queryKey: ['/api/leads/stats'],
    enabled: isAuthenticated,
  });

  const updateLeadMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      return await apiRequest('PATCH', `/api/leads/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/leads'] });
      queryClient.invalidateQueries({ queryKey: ['/api/leads/stats'] });
      toast({
        title: "Lead Updated",
        description: "Lead has been updated successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Update Failed",
        description: "Failed to update lead.",
        variant: "destructive",
      });
    },
  });

  const deleteLeadMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest('DELETE', `/api/leads/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/leads'] });
      queryClient.invalidateQueries({ queryKey: ['/api/leads/stats'] });
      setSelectedLead(null);
      toast({
        title: "Lead Deleted",
        description: "Lead has been removed.",
      });
    },
    onError: () => {
      toast({
        title: "Delete Failed",
        description: "Failed to delete lead.",
        variant: "destructive",
      });
    },
  });

  const handleDownloadAdf = async (leadId: number) => {
    try {
      const response = await fetch(`/api/leads/${leadId}/adf`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Download failed');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `lead-${leadId}.adf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      toast({
        title: "Download Failed",
        description: "Failed to download ADF file.",
        variant: "destructive",
      });
    }
  };

  const handleClaimLead = (lead: Lead) => {
    if (user) {
      updateLeadMutation.mutate({
        id: lead.id,
        data: { assignedTo: user.email || user.id },
      });
    }
  };

  const getStatCount = (status: string) => {
    if (!stats) return 0;
    const stat = stats.find(s => s.status === status);
    return stat?.count || 0;
  };

  const totalLeads = stats?.reduce((sum, s) => sum + s.count, 0) || 0;

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
        <div className="mb-8">
          <h1 className="text-3xl font-bold" data-testid="text-leads-title">Lead Requests</h1>
          <p className="text-muted-foreground mt-2">
            Customer parts requests submitted through the website
          </p>
        </div>

        <div className="flex flex-col md:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, email, or phone..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              className="pl-10"
              data-testid="input-lead-search"
            />
          </div>
        </div>

        <Tabs value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setCurrentPage(1); }} className="mb-6">
          <TabsList className="flex-wrap">
            <TabsTrigger value="all" data-testid="tab-all">
              All ({totalLeads})
            </TabsTrigger>
            <TabsTrigger value="new" data-testid="tab-new">
              New ({getStatCount('new')})
            </TabsTrigger>
            <TabsTrigger value="contacted" data-testid="tab-contacted">
              Contacted ({getStatCount('contacted')})
            </TabsTrigger>
            <TabsTrigger value="quoted" data-testid="tab-quoted">
              Quoted ({getStatCount('quoted')})
            </TabsTrigger>
            <TabsTrigger value="sold" data-testid="tab-sold">
              Sold ({getStatCount('sold')})
            </TabsTrigger>
            <TabsTrigger value="closed" data-testid="tab-closed">
              Closed ({getStatCount('closed')})
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : !data?.leads || data.leads.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Leads Found</h3>
              <p className="text-muted-foreground">
                {searchQuery || statusFilter !== 'all' 
                  ? "No leads match your current filters." 
                  : "Customer requests will appear here when submitted."}
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid gap-4">
              {data.leads.map((lead) => (
                <Card key={lead.id} className="hover-elevate cursor-pointer" onClick={() => setSelectedLead(lead)}>
                  <CardContent className="p-4">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="font-semibold text-lg" data-testid={`text-lead-name-${lead.id}`}>
                            {lead.firstName} {lead.lastName}
                          </h3>
                          <Badge className={statusColors[lead.status]} data-testid={`badge-status-${lead.id}`}>
                            {statusLabels[lead.status] || lead.status}
                          </Badge>
                          {lead.assignedTo && (
                            <Badge variant="outline" className="gap-1">
                              <User className="h-3 w-3" />
                              {lead.assignedTo}
                            </Badge>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Mail className="h-4 w-4" />
                            {lead.email}
                          </span>
                          <span className="flex items-center gap-1">
                            <Phone className="h-4 w-4" />
                            {lead.phone}
                          </span>
                          <span className="flex items-center gap-1">
                            <Package className="h-4 w-4" />
                            {lead.itemCount} item(s)
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar className="h-4 w-4" />
                            {format(new Date(lead.createdAt), "MMM d, yyyy 'at' h:mm a")}
                          </span>
                        </div>
                        {lead.vehicleInfo && (
                          <p className="text-sm text-muted-foreground mt-2 flex items-center gap-1">
                            <Car className="h-4 w-4" />
                            {lead.vehicleInfo}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {lead.cartTotal && (
                          <span className="font-semibold text-lg">${parseFloat(lead.cartTotal).toFixed(2)}</span>
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

        <Dialog open={!!selectedLead} onOpenChange={(open) => !open && setSelectedLead(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            {selectedLead && (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-3">
                    {selectedLead.firstName} {selectedLead.lastName}
                    <Badge className={statusColors[selectedLead.status]}>
                      {statusLabels[selectedLead.status] || selectedLead.status}
                    </Badge>
                  </DialogTitle>
                  <DialogDescription>
                    Submitted {format(new Date(selectedLead.createdAt), "MMMM d, yyyy 'at' h:mm a")}
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Email</p>
                      <p className="font-medium">{selectedLead.email}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Phone</p>
                      <p className="font-medium">{selectedLead.phone}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Preferred Contact</p>
                      <p className="font-medium capitalize">{selectedLead.preferredContact || 'Phone'}</p>
                    </div>
                    {selectedLead.vehicleInfo && (
                      <div>
                        <p className="text-sm text-muted-foreground">Vehicle</p>
                        <p className="font-medium">{selectedLead.vehicleInfo}</p>
                      </div>
                    )}
                  </div>

                  {selectedLead.comments && (
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Customer Notes</p>
                      <p className="text-sm bg-muted p-3 rounded-md">{selectedLead.comments}</p>
                    </div>
                  )}

                  <Separator />

                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-semibold">Cart Items ({selectedLead.itemCount})</h4>
                      {selectedLead.cartTotal && (
                        <span className="font-semibold text-lg">${parseFloat(selectedLead.cartTotal).toFixed(2)}</span>
                      )}
                    </div>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {selectedLead.cartItems.map((item: any, index: number) => (
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

                  <Separator />

                  <div className="flex flex-wrap gap-3">
                    <div className="flex-1 min-w-[200px]">
                      <p className="text-sm text-muted-foreground mb-2">Update Status</p>
                      <Select 
                        value={selectedLead.status} 
                        onValueChange={(status) => updateLeadMutation.mutate({ id: selectedLead.id, data: { status } })}
                      >
                        <SelectTrigger data-testid="select-lead-status">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="new">New</SelectItem>
                          <SelectItem value="contacted">Contacted</SelectItem>
                          <SelectItem value="quoted">Quoted</SelectItem>
                          <SelectItem value="sold">Sold</SelectItem>
                          <SelectItem value="closed">Closed</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {!selectedLead.assignedTo && (
                      <Button 
                        variant="outline" 
                        onClick={() => handleClaimLead(selectedLead)}
                        disabled={updateLeadMutation.isPending}
                        data-testid="button-claim-lead"
                      >
                        <User className="h-4 w-4 mr-2" />
                        Claim Lead
                      </Button>
                    )}
                    <Button 
                      variant="outline" 
                      onClick={() => handleDownloadAdf(selectedLead.id)}
                      data-testid="button-download-adf"
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Download ADF
                    </Button>
                    <Button 
                      variant="outline" 
                      onClick={() => window.location.href = `mailto:${selectedLead.email}`}
                      data-testid="button-email-customer"
                    >
                      <Mail className="h-4 w-4 mr-2" />
                      Email
                    </Button>
                    <Button 
                      variant="outline" 
                      onClick={() => window.location.href = `tel:${selectedLead.phone}`}
                      data-testid="button-call-customer"
                    >
                      <Phone className="h-4 w-4 mr-2" />
                      Call
                    </Button>
                    {isAdmin && (
                      <Button 
                        variant="destructive" 
                        onClick={() => deleteLeadMutation.mutate(selectedLead.id)}
                        disabled={deleteLeadMutation.isPending}
                        data-testid="button-delete-lead"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </Button>
                    )}
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
