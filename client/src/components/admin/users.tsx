import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatCurrency } from "@/lib/countries";
import { Search, Edit, Ban, Shield, Lock, Unlock, Star, Users, Loader2, UserPlus, ChevronDown, ChevronUp, Trash2, ChevronLeft, ChevronRight, Landmark } from "lucide-react";
import type { User, Product } from "@shared/schema";

interface UserProductItem {
  id: number;
  productId: number;
  productName: string;
  productPrice: number;
  dailyEarnings: string;
  isActive: boolean;
  purchaseDate: string;
  daysClaimed: number;
  totalCycle: number;
}

interface UserWithTeam extends User {
  level1Count: number;
  level2Count: number;
  level3Count: number;
  totalCommission: number;
  referrerName: string | null;
}

interface TeamMember {
  id: number;
  fullName: string;
  phone: string;
  country: string;
  balance: string;
  hasActiveProduct: boolean;
  hasDeposited: boolean;
  createdAt: string;
  totalInvested: number;
  products: { productName: string; productPrice: number; isActive: boolean }[];
}

interface DetailedTeam {
  level1: TeamMember[];
  level2: TeamMember[];
  level3: TeamMember[];
  totalLevel1Invested: number;
  totalLevel2Invested: number;
  totalLevel3Invested: number;
}

function TeamMemberCard({ member }: { member: TeamMember; level: number }) {
  return (
    <Card className="mb-2">
      <CardContent className="p-3">
        <div className="flex items-start justify-between">
          <div>
            <p className="font-medium text-foreground">{member.fullName}</p>
            <p className="text-xs text-muted-foreground">{member.phone} - {member.country}</p>
            <p className="text-xs text-muted-foreground">Inscrit: {new Date(member.createdAt).toLocaleDateString()}</p>
          </div>
          <div className="text-right">
            {member.hasActiveProduct && (
              <Badge className="text-xs mb-1">Actif</Badge>
            )}
            {member.hasDeposited && (
              <Badge variant="secondary" className="text-xs mb-1 ml-1">A depose</Badge>
            )}
          </div>
        </div>
        <div className="mt-2 pt-2 border-t">
          <p className="text-sm font-medium text-primary">
            Total investi: {member.totalInvested.toLocaleString()} F
          </p>
          {member.products.length > 0 && (
            <div className="mt-1">
              <p className="text-xs text-muted-foreground">Produits:</p>
              {member.products.map((p, i) => (
                <p key={i} className="text-xs">
                  - {p.productName} ({p.productPrice.toLocaleString()} F)
                  {p.isActive ? " (actif)" : " (termine)"}
                </p>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

interface AdminUsersProps {
  isSuperAdmin: boolean;
}

interface UsersResponse {
  users: UserWithTeam[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export default function AdminUsers({ isSuperAdmin }: AdminUsersProps) {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<"all" | "banned" | "blocked" | "promoter">("all");
  const [selectedUser, setSelectedUser] = useState<UserWithTeam | null>(null);
  const [editBalance, setEditBalance] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [selectedProduct, setSelectedProduct] = useState("");
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [teamUserId, setTeamUserId] = useState<number | null>(null);
  const [adminPinInput, setAdminPinInput] = useState("");

  // Debounce search input
  const debounceTimeout = useRef<ReturnType<typeof setTimeout>>();
  const handleSearchChange = (value: string) => {
    setSearchInput(value);
    if (debounceTimeout.current) clearTimeout(debounceTimeout.current);
    debounceTimeout.current = setTimeout(() => {
      setDebouncedSearch(value);
      setCurrentPage(1);
    }, 500);
  };

  const { data: usersData, isLoading } = useQuery<UsersResponse>({
    queryKey: ["/api/admin/users", { search: debouncedSearch, page: currentPage }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set("search", debouncedSearch);
      params.set("page", currentPage.toString());
      params.set("limit", "50");
      const res = await fetch(`/api/admin/users?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch users");
      return res.json();
    },
  });

  const users = usersData?.users || [];

  const { data: products } = useQuery<Product[]>({
    queryKey: ["/api/admin/products/all"],
  });

  const { data: teamData, isLoading: teamLoading } = useQuery<DetailedTeam>({
    queryKey: ["/api/admin/users", teamUserId, "team"],
    queryFn: async () => {
      if (!teamUserId) return null;
      const res = await fetch(`/api/admin/users/${teamUserId}/team`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch team");
      return res.json();
    },
    enabled: !!teamUserId,
  });

  const { data: userProducts, isLoading: userProductsLoading } = useQuery<UserProductItem[]>({
    queryKey: ["/api/admin/users", selectedUser?.id, "products"],
    queryFn: async () => {
      if (!selectedUser?.id) return [];
      const res = await fetch(`/api/admin/users/${selectedUser.id}/products`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch products");
      return res.json();
    },
    enabled: !!selectedUser?.id,
  });

  const revokeMutation = useMutation({
    mutationFn: async ({ userId, productId }: { userId: number; productId: number }) => {
      const response = await apiRequest("POST", `/api/admin/users/${userId}/revoke-product`, { value: productId });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || "Erreur");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users", selectedUser?.id, "products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Produit revoque!" });
    },
    onError: (error: any) => {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ userId, action, value }: { userId: number; action: string; value?: any }) => {
      const response = await apiRequest("POST", `/api/admin/users/${userId}/${action}`, { value });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || "Erreur");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Utilisateur mis a jour!" });
      setSelectedUser(null);
    },
    onError: (error: any) => {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    },
  });

  // Client-side status filter only (search is now server-side)
  const filteredUsers = users.filter(u => {
    if (statusFilter === "all") return true;
    if (statusFilter === "banned") return u.isBanned;
    if (statusFilter === "blocked") return u.isWithdrawalBlocked;
    if (statusFilter === "promoter") return u.isPromoter;
    return true;
  });

  const openTeamModal = (userId: number) => {
    setTeamUserId(userId);
    setShowTeamModal(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher par telephone, nom ou code..."
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-10"
            data-testid="input-search-users"
          />
        </div>
      </div>

      {usersData && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{usersData.total} utilisateur{usersData.total > 1 ? "s" : ""} trouve{usersData.total > 1 ? "s" : ""}</span>
          <span>Page {usersData.page} / {usersData.totalPages}</span>
        </div>
      )}

      <div className="flex gap-2 overflow-x-auto">
        {(["all", "banned", "blocked", "promoter"] as const).map((status) => (
          <Button
            key={status}
            size="sm"
            variant={statusFilter === status ? "default" : "outline"}
            onClick={() => setStatusFilter(status)}
          >
            {status === "all" ? "Tous" : status === "banned" ? "Bannis" : status === "blocked" ? "Retrait bloque" : "Promoteurs"}
          </Button>
        ))}
      </div>

      <div className="space-y-3">
        {isLoading ? (
          Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-32" />)
        ) : filteredUsers.length > 0 ? (
          filteredUsers.map((user) => (
            <Card key={user.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-foreground">{user.fullName}</p>
                      {user.isAdmin && <Badge variant="destructive" className="text-xs">Admin</Badge>}
                      {(user as any).isBanker && <Badge className="text-xs bg-blue-600">Bankier</Badge>}
                      {user.isPromoter && <Badge className="text-xs">Promoteur</Badge>}
                      {user.isBanned && <Badge variant="destructive" className="text-xs">Banni</Badge>}
                      {user.isWithdrawalBlocked && <Badge variant="secondary" className="text-xs">Retrait bloque</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground">{user.phone} - {user.country}</p>
                    <p className="text-xs text-muted-foreground">Code: {user.referralCode}</p>
                    {user.referrerName && (
                      <p className="text-xs text-primary flex items-center gap-1 mt-1">
                        <UserPlus className="w-3 h-3" />
                        Invite par: <span className="font-medium">{user.referrerName}</span>
                      </p>
                    )}
                    {user.referredBy && !user.referrerName && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                        <UserPlus className="w-3 h-3" />
                        Code parrain: {user.referredBy}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => navigate(`/admin/team/${user.id}`)}>
                      <Users className="w-4 h-4 mr-1" />
                      Equipe
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => setSelectedUser(user)}>
                      <Edit className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <p className="text-muted-foreground">Solde</p>
                    <p className="font-medium text-foreground">{formatCurrency(parseFloat(user.balance), user.country)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Equipe</p>
                    <p className="font-medium text-foreground">{user.level1Count + user.level2Count + user.level3Count}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Commissions</p>
                    <p className="font-medium text-primary">{formatCurrency(user.totalCommission, user.country)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            Aucun utilisateur trouve
          </div>
        )}
      </div>

      {usersData && usersData.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1 || isLoading}
            data-testid="button-prev-page"
          >
            <ChevronLeft className="w-4 h-4" />
            Precedent
          </Button>
          <span className="text-sm text-muted-foreground px-2">
            {currentPage} / {usersData.totalPages}
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setCurrentPage(p => Math.min(usersData.totalPages, p + 1))}
            disabled={currentPage === usersData.totalPages || isLoading}
            data-testid="button-next-page"
          >
            Suivant
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}

      <Dialog open={showTeamModal} onOpenChange={() => { setShowTeamModal(false); setTeamUserId(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Equipe de l'utilisateur</DialogTitle>
          </DialogHeader>

          {teamLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-8 h-8 animate-spin" />
            </div>
          ) : teamData ? (
            <Tabs defaultValue="level1" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="level1">
                  Niveau 1 ({teamData.level1.length})
                </TabsTrigger>
                <TabsTrigger value="level2">
                  Niveau 2 ({teamData.level2.length})
                </TabsTrigger>
                <TabsTrigger value="level3">
                  Niveau 3 ({teamData.level3.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="level1" className="mt-4">
                <Card className="mb-3">
                  <CardContent className="p-3 text-center">
                    <p className="text-lg font-bold text-primary">
                      {teamData.totalLevel1Invested.toLocaleString()} F
                    </p>
                    <p className="text-xs text-muted-foreground">Total investi niveau 1</p>
                  </CardContent>
                </Card>
                {teamData.level1.length > 0 ? (
                  teamData.level1.map(member => (
                    <TeamMemberCard key={member.id} member={member} level={1} />
                  ))
                ) : (
                  <p className="text-center text-muted-foreground py-4">Aucun filleul niveau 1</p>
                )}
              </TabsContent>

              <TabsContent value="level2" className="mt-4">
                <Card className="mb-3">
                  <CardContent className="p-3 text-center">
                    <p className="text-lg font-bold text-primary">
                      {teamData.totalLevel2Invested.toLocaleString()} F
                    </p>
                    <p className="text-xs text-muted-foreground">Total investi niveau 2</p>
                  </CardContent>
                </Card>
                {teamData.level2.length > 0 ? (
                  teamData.level2.map(member => (
                    <TeamMemberCard key={member.id} member={member} level={2} />
                  ))
                ) : (
                  <p className="text-center text-muted-foreground py-4">Aucun filleul niveau 2</p>
                )}
              </TabsContent>

              <TabsContent value="level3" className="mt-4">
                <Card className="mb-3">
                  <CardContent className="p-3 text-center">
                    <p className="text-lg font-bold text-primary">
                      {teamData.totalLevel3Invested.toLocaleString()} F
                    </p>
                    <p className="text-xs text-muted-foreground">Total investi niveau 3</p>
                  </CardContent>
                </Card>
                {teamData.level3.length > 0 ? (
                  teamData.level3.map(member => (
                    <TeamMemberCard key={member.id} member={member} level={3} />
                  ))
                ) : (
                  <p className="text-center text-muted-foreground py-4">Aucun filleul niveau 3</p>
                )}
              </TabsContent>
            </Tabs>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedUser} onOpenChange={() => setSelectedUser(null)}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Gerer {selectedUser?.fullName}</DialogTitle>
          </DialogHeader>

          {selectedUser && (
            <div className="space-y-4">
              {selectedUser.referrerName && (
                <div className="bg-secondary rounded-lg p-3">
                  <p className="text-sm">
                    <span className="text-muted-foreground">Invite par:</span>{" "}
                    <span className="font-medium">{selectedUser.referrerName}</span>
                  </p>
                </div>
              )}

              <div className="grid grid-cols-3 gap-2 text-center text-sm">
                <div className="bg-secondary rounded-lg p-3">
                  <Users className="w-5 h-5 text-primary mx-auto mb-1" />
                  <p className="text-xs text-muted-foreground">Niveau 1</p>
                  <p className="font-bold">{selectedUser.level1Count}</p>
                </div>
                <div className="bg-secondary rounded-lg p-3">
                  <Users className="w-5 h-5 text-foreground mx-auto mb-1" />
                  <p className="text-xs text-muted-foreground">Niveau 2</p>
                  <p className="font-bold">{selectedUser.level2Count}</p>
                </div>
                <div className="bg-secondary rounded-lg p-3">
                  <Users className="w-5 h-5 text-muted-foreground mx-auto mb-1" />
                  <p className="text-xs text-muted-foreground">Niveau 3</p>
                  <p className="font-bold">{selectedUser.level3Count}</p>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium">Modifier le solde</label>
                  <div className="flex gap-2 mt-1">
                    <Input
                      type="number"
                      value={editBalance}
                      onChange={(e) => setEditBalance(e.target.value)}
                      placeholder="Nouveau solde"
                    />
                    <Button
                      onClick={() => updateMutation.mutate({ userId: selectedUser.id, action: "balance", value: parseFloat(editBalance) })}
                      disabled={updateMutation.isPending || !editBalance}
                    >
                      {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "OK"}
                    </Button>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium">Reinitialiser mot de passe</label>
                  <div className="flex gap-2 mt-1">
                    <Input
                      type="text"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Nouveau mot de passe"
                    />
                    <Button
                      onClick={() => updateMutation.mutate({ userId: selectedUser.id, action: "password", value: newPassword })}
                      disabled={updateMutation.isPending || !newPassword}
                    >
                      {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "OK"}
                    </Button>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium">Attribuer un produit</label>
                  <div className="flex gap-2 mt-1">
                    <Select value={selectedProduct} onValueChange={setSelectedProduct}>
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Choisir un produit" />
                      </SelectTrigger>
                      <SelectContent>
                        {products?.filter(p => !p.isFree).map((product) => (
                          <SelectItem key={product.id} value={product.id.toString()}>
                            {product.name} - {product.price.toLocaleString()} F
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      onClick={() => updateMutation.mutate({ userId: selectedUser.id, action: "assign-product", value: parseInt(selectedProduct) })}
                      disabled={updateMutation.isPending || !selectedProduct}
                    >
                      {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "OK"}
                    </Button>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium">Produits de l'utilisateur</label>
                  <div className="mt-2 space-y-2 max-h-40 overflow-y-auto">
                    {userProductsLoading ? (
                      <p className="text-sm text-muted-foreground">Chargement...</p>
                    ) : userProducts && userProducts.length > 0 ? (
                      userProducts.map((up) => (
                        <div key={up.id} className={`flex items-center justify-between p-2 rounded-lg ${up.isActive ? "bg-green-500/10 border border-green-500/20" : "bg-secondary"}`}>
                          <div>
                            <p className="text-sm font-medium">{up.productName}</p>
                            <p className="text-xs text-muted-foreground">
                              {up.productPrice.toLocaleString()} F - Jour {up.daysClaimed}/{up.totalCycle}
                              {up.isActive ? " (Actif)" : " (Termine)"}
                            </p>
                          </div>
                          {up.isActive && (
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => revokeMutation.mutate({ userId: selectedUser.id, productId: up.productId })}
                              disabled={revokeMutation.isPending}
                              data-testid={`button-revoke-product-${up.productId}`}
                            >
                              {revokeMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                            </Button>
                          )}
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">Aucun produit</p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant={selectedUser.isBanned ? "default" : "destructive"}
                    onClick={() => updateMutation.mutate({ userId: selectedUser.id, action: "toggle-ban" })}
                    disabled={updateMutation.isPending}
                  >
                    <Ban className="w-4 h-4 mr-2" />
                    {selectedUser.isBanned ? "Debannir" : "Bannir"}
                  </Button>

                  <Button
                    variant={selectedUser.isWithdrawalBlocked ? "default" : "secondary"}
                    onClick={() => updateMutation.mutate({ userId: selectedUser.id, action: "toggle-withdrawal" })}
                    disabled={updateMutation.isPending}
                  >
                    {selectedUser.isWithdrawalBlocked ? <Unlock className="w-4 h-4 mr-2" /> : <Lock className="w-4 h-4 mr-2" />}
                    {selectedUser.isWithdrawalBlocked ? "Debloquer" : "Bloquer retrait"}
                  </Button>

                  <Button
                    variant={selectedUser.isPromoter ? "secondary" : "outline"}
                    onClick={() => updateMutation.mutate({ userId: selectedUser.id, action: "toggle-promoter" })}
                    disabled={updateMutation.isPending}
                  >
                    <Star className="w-4 h-4 mr-2" />
                    {selectedUser.isPromoter ? "Retirer promoteur" : "Promoteur"}
                  </Button>

                  <Button
                    variant={selectedUser.mustInviteToWithdraw ? "default" : "outline"}
                    onClick={() => updateMutation.mutate({ userId: selectedUser.id, action: "toggle-must-invite" })}
                    disabled={updateMutation.isPending}
                  >
                    <Users className="w-4 h-4 mr-2" />
                    {selectedUser.mustInviteToWithdraw ? "Desactiver" : "Doit inviter"}
                  </Button>

                  {!selectedUser.isAdmin && !selectedUser.isSuperAdmin && (
                    <Button
                      variant={(selectedUser as any).isBanker ? "default" : "outline"}
                      className={(selectedUser as any).isBanker ? "bg-blue-600 hover:bg-blue-700 col-span-2" : "col-span-2"}
                      onClick={() => updateMutation.mutate({ userId: selectedUser.id, action: "toggle-banker" })}
                      disabled={updateMutation.isPending}
                      data-testid="button-toggle-banker"
                    >
                      <Landmark className="w-4 h-4 mr-2" />
                      {(selectedUser as any).isBanker ? "Retirer role Bankier" : "Nommer Bankier"}
                    </Button>
                  )}

                  {isSuperAdmin && selectedUser.isAdmin && !selectedUser.isSuperAdmin && (
                    <Button
                      variant="outline"
                      className="col-span-2 border-yellow-500 text-yellow-600 hover:bg-yellow-50"
                      onClick={() => updateMutation.mutate({ userId: selectedUser.id, action: "toggle-super-admin" })}
                      disabled={updateMutation.isPending}
                      data-testid="button-toggle-super-admin"
                    >
                      <Shield className="w-4 h-4 mr-2" />
                      Nommer Super Administrateur
                    </Button>
                  )}

                  {isSuperAdmin && selectedUser.isSuperAdmin && (
                    <Button
                      variant="outline"
                      className="col-span-2 border-yellow-500 text-yellow-600 hover:bg-yellow-50"
                      onClick={() => updateMutation.mutate({ userId: selectedUser.id, action: "toggle-super-admin" })}
                      disabled={updateMutation.isPending}
                      data-testid="button-remove-super-admin"
                    >
                      <Shield className="w-4 h-4 mr-2" />
                      Retirer Super Administrateur
                    </Button>
                  )}

                  {isSuperAdmin && !selectedUser.isSuperAdmin && (
                    <div className="col-span-2 space-y-2">
                      {!selectedUser.isAdmin && (
                        <div>
                          <label className="text-sm font-medium">Code PIN pour l'admin</label>
                          <Input
                            type="text"
                            value={adminPinInput}
                            onChange={(e) => setAdminPinInput(e.target.value)}
                            placeholder="Ex: 1234"
                            className="mt-1"
                            maxLength={8}
                            data-testid="input-new-admin-pin"
                          />
                        </div>
                      )}
                      <Button
                        variant={selectedUser.isAdmin ? "secondary" : "outline"}
                        onClick={() => {
                          updateMutation.mutate({ 
                            userId: selectedUser.id, 
                            action: "toggle-admin", 
                            value: !selectedUser.isAdmin ? adminPinInput : undefined 
                          });
                          setAdminPinInput("");
                        }}
                        disabled={updateMutation.isPending || (!selectedUser.isAdmin && adminPinInput.length < 4)}
                        className="w-full"
                      >
                        <Shield className="w-4 h-4 mr-2" />
                        {selectedUser.isAdmin ? "Retirer admin" : "Nommer admin"}
                      </Button>
                      {selectedUser.isAdmin && (
                        <Button
                          variant={selectedUser.isAdminPasswordRequired ? "outline" : "default"}
                          onClick={() => updateMutation.mutate({ 
                            userId: selectedUser.id, 
                            action: "toggle-password-required", 
                            value: !selectedUser.isAdminPasswordRequired 
                          })}
                          disabled={updateMutation.isPending}
                          className="w-full"
                        >
                          {selectedUser.isAdminPasswordRequired ? <Lock className="w-4 h-4 mr-2" /> : <Unlock className="w-4 h-4 mr-2" />}
                          {selectedUser.isAdminPasswordRequired ? "PIN requis pour cet admin" : "Sans PIN pour cet admin"}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
