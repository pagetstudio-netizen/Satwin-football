import { Switch, Route, useLocation, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { AlertModal } from "@/components/alert-modal";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth";
import BottomNav from "@/components/bottom-nav";
import LoginPage from "@/pages/login";
import RegisterPage from "@/pages/register";
import HomePage from "@/pages/home";
import MatchPage from "@/pages/match";
import BilletPage from "@/pages/billet";
import TeamPage from "@/pages/team";
import AccountPage from "@/pages/account";
import AdminPage from "@/pages/admin";
import AdminTeamPage from "@/pages/admin-team";
import BankerPage from "@/pages/banker";
import DepositPage from "@/pages/deposit";
import DrimpayPage from "@/pages/drimpay";
import WithdrawalPage from "@/pages/withdrawal";
import DepotRetraitPage from "@/pages/depot-retrait";
import InfosPage from "@/pages/infos";
import DepositHistoryPage from "@/pages/deposit-history";
import DepositsHistoryPage from "@/pages/deposit-history-real";
import HistoryPage from "@/pages/history";
import ServicePage from "@/pages/service";
import WalletPage from "@/pages/wallet";
import ChangePasswordPage from "@/pages/change-password";
import AboutPage from "@/pages/about";
import RulesPage from "@/pages/rules";
import GiftCodePage from "@/pages/gift-code";
import TeamDetailsPage from "@/pages/team-details";
import WithdrawalHistoryPage from "@/pages/withdrawal-history";
import DepositOrdersPage from "@/pages/deposit-orders";
import NotFound from "@/pages/not-found";
import { Loader2 } from "lucide-react";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const [location] = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#0B1929" }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#E63946" }} />
      </div>
    );
  }

  if (!user) return <Redirect to="/login" />;

  if (user.isBanned) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "#0B1929" }}>
        <div className="text-center">
          <div className="text-4xl mb-3">🚫</div>
          <h1 className="text-xl font-bold text-white mb-2">Compte suspendu</h1>
          <p className="text-white/50 text-sm">Votre compte a été suspendu. Contactez le support.</p>
        </div>
      </div>
    );
  }

  if ((user as any).isBanker && !user.isAdmin && location !== "/banker") {
    return <Redirect to="/banker" />;
  }

  return <>{children}</>;
}

function BankerRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "#0B1929" }}>
      <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#E63946" }} />
    </div>
  );
  if (!user) return <Redirect to="/login" />;
  if (!(user as any).isBanker && !user.isAdmin) return <Redirect to="/" />;
  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "#0B1929" }}>
      <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#E63946" }} />
    </div>
  );
  if (!user || !user.isAdmin) return <Redirect to="/" />;
  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "#0B1929" }}>
      <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#E63946" }} />
    </div>
  );
  if (user) return <Redirect to="/" />;
  return <>{children}</>;
}

function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen pb-16" style={{ background: "#f3f4f6" }}>
      {children}
      <BottomNav />
    </div>
  );
}

function Router() {
  return (
    <Switch>
      {/* Public */}
      <Route path="/login">
        <PublicRoute><LoginPage /></PublicRoute>
      </Route>
      <Route path="/register">
        <PublicRoute><RegisterPage /></PublicRoute>
      </Route>
      <Route path="/invitation">
        <PublicRoute><RegisterPage /></PublicRoute>
      </Route>
      <Route path="/rejoindre">
        <PublicRoute><RegisterPage /></PublicRoute>
      </Route>

      {/* Main 5 tabs */}
      <Route path="/">
        <ProtectedRoute><AppLayout><HomePage /></AppLayout></ProtectedRoute>
      </Route>
      <Route path="/match">
        <ProtectedRoute><AppLayout><MatchPage /></AppLayout></ProtectedRoute>
      </Route>
      <Route path="/billet">
        <ProtectedRoute><AppLayout><BilletPage /></AppLayout></ProtectedRoute>
      </Route>
      <Route path="/team">
        <ProtectedRoute><AppLayout><TeamPage /></AppLayout></ProtectedRoute>
      </Route>
      <Route path="/account">
        <ProtectedRoute><AppLayout><AccountPage /></AppLayout></ProtectedRoute>
      </Route>

      {/* Supporting pages */}
      <Route path="/depot-retrait">
        <ProtectedRoute><DepotRetraitPage /></ProtectedRoute>
      </Route>
      <Route path="/infos">
        <ProtectedRoute><InfosPage /></ProtectedRoute>
      </Route>
      <Route path="/deposit">
        <ProtectedRoute><DepositPage /></ProtectedRoute>
      </Route>
      <Route path="/drimpay">
        <ProtectedRoute><DrimpayPage /></ProtectedRoute>
      </Route>
      <Route path="/withdrawal">
        <ProtectedRoute><WithdrawalPage /></ProtectedRoute>
      </Route>
      <Route path="/deposit-history">
        <ProtectedRoute><DepositHistoryPage /></ProtectedRoute>
      </Route>
      <Route path="/deposits-history">
        <ProtectedRoute><DepositsHistoryPage /></ProtectedRoute>
      </Route>
      <Route path="/history">
        <ProtectedRoute><HistoryPage /></ProtectedRoute>
      </Route>
      <Route path="/withdrawal-history">
        <ProtectedRoute><WithdrawalHistoryPage /></ProtectedRoute>
      </Route>
      <Route path="/deposit-orders">
        <ProtectedRoute><DepositOrdersPage /></ProtectedRoute>
      </Route>
      <Route path="/service">
        <ProtectedRoute><ServicePage /></ProtectedRoute>
      </Route>
      <Route path="/wallet">
        <ProtectedRoute><WalletPage /></ProtectedRoute>
      </Route>
      <Route path="/change-password">
        <ProtectedRoute><ChangePasswordPage /></ProtectedRoute>
      </Route>
      <Route path="/about">
        <ProtectedRoute><AboutPage /></ProtectedRoute>
      </Route>
      <Route path="/rules">
        <ProtectedRoute><RulesPage /></ProtectedRoute>
      </Route>
      <Route path="/gift-code">
        <ProtectedRoute><GiftCodePage /></ProtectedRoute>
      </Route>
      <Route path="/team-details">
        <ProtectedRoute><TeamDetailsPage /></ProtectedRoute>
      </Route>

      {/* Admin */}
      <Route path="/admin" component={NotFound} />
      <Route path="/admin/:rest*" component={NotFound} />
      <Route path={import.meta.env.VITE_ADMIN_SECRET_PATH || "/gestion-admin"}>
        <AdminRoute><AdminPage /></AdminRoute>
      </Route>
      <Route path={`${import.meta.env.VITE_ADMIN_SECRET_PATH || "/gestion-admin"}/team/:id`}>
        <AdminRoute><AdminTeamPage /></AdminRoute>
      </Route>

      {/* Banker */}
      <Route path="/banker">
        <BankerRoute><BankerPage /></BankerRoute>
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <Router />
          <AlertModal />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
