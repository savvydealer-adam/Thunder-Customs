import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Download, Mail, Phone, Calendar, Package, Loader2 } from "lucide-react";
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
  phone: string | null;
  comments: string | null;
  cartItems: any[];
  cartTotal: string | null;
  status: string;
  createdAt: string;
}

const statusColors: Record<string, string> = {
  new: "bg-blue-500",
  contacted: "bg-yellow-500",
  quoted: "bg-purple-500",
  sold: "bg-green-500",
  lost: "bg-red-500",
};

export default function Leads() {
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: leads, isLoading } = useQuery<Lead[]>({
    queryKey: ['/api/leads'],
    enabled: isAuthenticated,
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      return await apiRequest('PATCH', `/api/leads/${id}/status`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/leads'] });
      toast({
        title: "Status Updated",
        description: "Lead status has been updated.",
      });
    },
    onError: () => {
      toast({
        title: "Update Failed",
        description: "Failed to update lead status.",
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
        <div className="mb-8">
          <h1 className="text-3xl font-bold" data-testid="text-leads-title">Lead Requests</h1>
          <p className="text-muted-foreground mt-2">
            Customer parts requests submitted through the website
          </p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : !leads || leads.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Leads Yet</h3>
              <p className="text-muted-foreground">
                Customer requests will appear here when submitted.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {leads.map((lead) => (
              <Card key={lead.id} data-testid={`lead-card-${lead.id}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                      <CardTitle className="text-lg">
                        {lead.firstName} {lead.lastName}
                      </CardTitle>
                      <div className="flex flex-wrap gap-3 mt-2 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Mail className="h-4 w-4" />
                          {lead.email}
                        </span>
                        {lead.phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="h-4 w-4" />
                            {lead.phone}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Calendar className="h-4 w-4" />
                          {format(new Date(lead.createdAt), 'MMM d, yyyy h:mm a')}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Select
                        value={lead.status}
                        onValueChange={(status) => updateStatusMutation.mutate({ id: lead.id, status })}
                      >
                        <SelectTrigger className="w-32" data-testid={`select-status-${lead.id}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="new">New</SelectItem>
                          <SelectItem value="contacted">Contacted</SelectItem>
                          <SelectItem value="quoted">Quoted</SelectItem>
                          <SelectItem value="sold">Sold</SelectItem>
                          <SelectItem value="lost">Lost</SelectItem>
                        </SelectContent>
                      </Select>
                      <Badge className={`${statusColors[lead.status]} text-white`}>
                        {lead.status.charAt(0).toUpperCase() + lead.status.slice(1)}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {lead.comments && (
                    <div className="mb-4 p-3 bg-muted rounded-lg">
                      <p className="text-sm font-medium mb-1">Customer Comments:</p>
                      <p className="text-sm text-muted-foreground">{lead.comments}</p>
                    </div>
                  )}
                  
                  <Separator className="my-4" />
                  
                  <div className="mb-4">
                    <h4 className="font-medium mb-2">Requested Items ({lead.cartItems?.length || 0})</h4>
                    <div className="space-y-2">
                      {lead.cartItems?.map((item: any, index: number) => (
                        <div key={index} className="flex justify-between items-center text-sm p-2 bg-muted/50 rounded">
                          <div>
                            <span className="font-medium">{item.product.partNumber}</span>
                            <span className="mx-2 text-muted-foreground">-</span>
                            <span>{item.product.partName}</span>
                            <Badge variant="outline" className="ml-2 text-xs">
                              {item.product.manufacturer}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-4">
                            <span className="text-muted-foreground">Qty: {item.quantity}</span>
                            {item.product.price && (
                              <span className="font-medium">
                                ${(parseFloat(item.product.price) * item.quantity).toFixed(2)}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    {lead.cartTotal && (
                      <div className="text-lg font-semibold">
                        Total: ${parseFloat(lead.cartTotal).toFixed(2)}
                      </div>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={() => handleDownloadAdf(lead.id)}
                      data-testid={`button-download-adf-${lead.id}`}
                    >
                      <Download className="h-4 w-4" />
                      Download ADF
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
