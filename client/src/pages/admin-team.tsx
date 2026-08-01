import { useQuery } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Users, TrendingUp } from "lucide-react";
import type { User } from "@shared/schema";

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

export default function AdminTeamPage() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const userId = parseInt(params.id || "0");

  const { data: user, isLoading: userLoading } = useQuery<User>({
    queryKey: ["/api/admin/users", userId, "info"],
    queryFn: async () => {
      const res = await fetch(`/api/admin/users`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch users");
      const users = await res.json();
      return users.find((u: User) => u.id === userId);
    },
    enabled: !!userId,
  });

  const { data: teamData, isLoading: teamLoading } = useQuery<DetailedTeam>({
    queryKey: ["/api/admin/users", userId, "team"],
    queryFn: async () => {
      const res = await fetch(`/api/admin/users/${userId}/team`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch team");
      return res.json();
    },
    enabled: !!userId,
  });

  const isLoading = userLoading || teamLoading;

  const TeamMemberCard = ({ member }: { member: TeamMember }) => (
    <Card className="mb-3">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="font-medium text-foreground text-lg">{member.fullName}</p>
            <p className="text-sm text-muted-foreground">{member.phone} - {member.country}</p>
            <p className="text-xs text-muted-foreground">
              Inscrit le {new Date(member.createdAt).toLocaleDateString("fr-FR")}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            {member.hasActiveProduct && (
              <Badge className="text-xs">Produit actif</Badge>
            )}
            {member.hasDeposited && (
              <Badge variant="secondary" className="text-xs">A depose</Badge>
            )}
          </div>
        </div>

        <div className="bg-primary/10 rounded-lg p-3 mb-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">Total investi</p>
              <p className="text-xl font-bold text-primary">
                {member.totalInvested.toLocaleString()} F
              </p>
            </div>
          </div>
        </div>

        {member.products.length > 0 && (
          <div>
            <p className="text-sm font-medium mb-2">Produits achetes:</p>
            <div className="space-y-1">
              {member.products.map((p, i) => (
                <div key={i} className="flex items-center justify-between text-sm bg-secondary rounded-lg px-3 py-2">
                  <span>{p.productName}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{p.productPrice.toLocaleString()} F</span>
                    <Badge variant={p.isActive ? "default" : "secondary"} className="text-xs">
                      {p.isActive ? "Actif" : "Terminé"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {member.products.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-2">
            Aucun produit acheté
          </p>
        )}
      </CardContent>
    </Card>
  );

  const LevelSummary = ({ total, count, level }: { total: number; count: number; level: number }) => (
    <Card className="mb-4">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
              <Users className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Niveau {level}</p>
              <p className="font-medium">{count} membre{count > 1 ? "s" : ""}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Total investi</p>
            <p className="text-xl font-bold text-primary">{total.toLocaleString()} F</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card border-b sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(import.meta.env.VITE_ADMIN_SECRET_PATH)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="font-bold text-lg">Equipe de {user?.fullName || "..."}</h1>
            <p className="text-xs text-muted-foreground">{user?.phone}</p>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto p-4">
        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-24" />
            <Skeleton className="h-12" />
            <Skeleton className="h-40" />
            <Skeleton className="h-40" />
          </div>
        ) : teamData ? (
          <>
            <Card className="mb-4">
              <CardContent className="p-4">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-2xl font-bold text-primary">{teamData.level1.length}</p>
                    <p className="text-xs text-muted-foreground">Niveau 1</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-foreground">{teamData.level2.length}</p>
                    <p className="text-xs text-muted-foreground">Niveau 2</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-muted-foreground">{teamData.level3.length}</p>
                    <p className="text-xs text-muted-foreground">Niveau 3</p>
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t text-center">
                  <p className="text-xs text-muted-foreground">Total investi par l'equipe</p>
                  <p className="text-2xl font-bold text-primary">
                    {(teamData.totalLevel1Invested + teamData.totalLevel2Invested + teamData.totalLevel3Invested).toLocaleString()} F
                  </p>
                </div>
              </CardContent>
            </Card>

            <Tabs defaultValue="level1" className="w-full">
              <TabsList className="grid w-full grid-cols-3 mb-4">
                <TabsTrigger value="level1">
                  Niv. 1 ({teamData.level1.length})
                </TabsTrigger>
                <TabsTrigger value="level2">
                  Niv. 2 ({teamData.level2.length})
                </TabsTrigger>
                <TabsTrigger value="level3">
                  Niv. 3 ({teamData.level3.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="level1">
                <LevelSummary 
                  total={teamData.totalLevel1Invested} 
                  count={teamData.level1.length} 
                  level={1} 
                />
                {teamData.level1.length > 0 ? (
                  teamData.level1.map(member => (
                    <TeamMemberCard key={member.id} member={member} />
                  ))
                ) : (
                  <Card>
                    <CardContent className="p-8 text-center text-muted-foreground">
                      Aucun filleul niveau 1
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="level2">
                <LevelSummary 
                  total={teamData.totalLevel2Invested} 
                  count={teamData.level2.length} 
                  level={2} 
                />
                {teamData.level2.length > 0 ? (
                  teamData.level2.map(member => (
                    <TeamMemberCard key={member.id} member={member} />
                  ))
                ) : (
                  <Card>
                    <CardContent className="p-8 text-center text-muted-foreground">
                      Aucun filleul niveau 2
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="level3">
                <LevelSummary 
                  total={teamData.totalLevel3Invested} 
                  count={teamData.level3.length} 
                  level={3} 
                />
                {teamData.level3.length > 0 ? (
                  teamData.level3.map(member => (
                    <TeamMemberCard key={member.id} member={member} />
                  ))
                ) : (
                  <Card>
                    <CardContent className="p-8 text-center text-muted-foreground">
                      Aucun filleul niveau 3
                    </CardContent>
                  </Card>
                )}
              </TabsContent>
            </Tabs>
          </>
        ) : (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              Utilisateur non trouve
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
