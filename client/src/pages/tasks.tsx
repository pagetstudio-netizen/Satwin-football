import { useAuth } from "@/lib/auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { getCountryByCode } from "@/lib/countries";
import { ChevronLeft, Loader2, Trophy, CheckCircle2 } from "lucide-react";
import { Link } from "wouter";
import type { Task } from "@shared/schema";
import jollibeeImg from "@assets/téléchargement_(19)_1784561452588.jpeg";
import emptyIllustration from "@assets/illustration-8_1784762965573.png";
import jollibeeLogo from "@assets/6790d8bd04714fedd7593cb6_Doosan_Group_and_Corporation_-_Logo.s_1784561452870.png";
import iconBronze from "@assets/344464_1773318022355.png";
import iconArgent from "@assets/817729_1773318022328.png";
import iconOr from "@assets/sac-argent-gros-tas-illustration-icone-argent-comptant-icone-p_1773318022388.jpg";
import iconPlatine from "@assets/1751761_1773318022264.png";
import iconDiamant from "@assets/3275655_1773318022415.png";

interface TaskWithStatus extends Task {
  isCompleted: boolean;
  canClaim: boolean;
  currentInvites: number;
}

const TIER_LABELS = [
  "Parrain Bronze",
  "Parrain Argent",
  "Parrain Or",
  "Parrain Platine",
  "Parrain Diamant",
  "Parrain Elite",
];

const TIER_COLORS = [
  { bg: "from-amber-700 to-amber-500" },
  { bg: "from-gray-500 to-gray-400" },
  { bg: "from-yellow-600 to-yellow-400" },
  { bg: "from-cyan-600 to-cyan-400" },
  { bg: "from-blue-700 to-blue-500" },
  { bg: "from-purple-700 to-purple-500" },
];

const TIER_ICONS = [iconBronze, iconArgent, iconOr, iconPlatine, iconDiamant, iconBronze];

export default function TasksPage() {
  const { user, refreshUser } = useAuth();
  const { toast } = useToast();

  const { data: tasks, isLoading } = useQuery<TaskWithStatus[]>({
    queryKey: ["/api/tasks"],
  });

  const claimMutation = useMutation({
    mutationFn: async (taskId: number) => {
      const response = await apiRequest("POST", `/api/tasks/${taskId}/claim`, {});
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || "Erreur");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      refreshUser();
      toast({ title: "Récompense réclamée!", description: "Le bonus a été ajouté à votre compte." });
    },
    onError: (error: any) => {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    },
  });

  if (!user) return null;

  const countryInfo = getCountryByCode(user.country);
  const currency = countryInfo?.currency || "FCFA";
  const totalTaskRewards = tasks?.filter(t => t.isCompleted).reduce((sum, t) => sum + t.reward, 0) || 0;
  const completedCount = tasks?.filter(t => t.isCompleted).length || 0;
  const claimableCount = tasks?.filter(t => t.canClaim && !t.isCompleted).length || 0;

  return (
    <div className="flex flex-col min-h-full bg-gray-50">

      {/* Hero Section — tall enough so bottom text clears the stats card overlap */}
      <div className="relative overflow-hidden" style={{ height: "260px" }}>
        <img
          src={jollibeeImg}
          alt="Doosan"
          className="w-full h-full object-cover object-center"
        />
        {/* Dark gradient overlay */}
        <div
          className="absolute inset-0"
          style={{ background: "linear-gradient(to bottom, rgba(0,113,197,0.80) 0%, rgba(0,90,158,0.70) 45%, rgba(0,40,100,0.95) 100%)" }}
        />

        {/* Header nav */}
        <div className="absolute top-0 left-0 right-0 flex items-center px-4 pt-4">
          <Link href="/">
            <button
              className="w-9 h-9 rounded-full bg-white/25 backdrop-blur-sm flex items-center justify-center"
              data-testid="button-back"
            >
              <ChevronLeft className="w-5 h-5 text-white" />
            </button>
          </Link>
          <div className="flex-1 flex justify-center">
            <img src={jollibeeLogo} alt="Doosan" className="h-8 object-contain" />
          </div>
          <div className="w-9" />
        </div>

        {/* Hero text — positioned above the stats card overlap zone (bottom 60px) */}
        <div className="absolute left-4 right-4" style={{ bottom: "60px" }}>
          <h1 className="text-white font-bold text-xl leading-tight" style={{ textShadow: "0 1px 4px rgba(0,0,0,0.5)" }}>
            Programme de Parrainage
          </h1>
          <p className="text-white text-xs mt-1" style={{ opacity: 0.92, textShadow: "0 1px 3px rgba(0,0,0,0.4)" }}>
            Invitez des amis et gagnez des récompenses
          </p>
        </div>
      </div>

      {/* Stats Row — overlaps bottom of hero */}
      <div className="mx-4 -mt-10 z-10 relative">
        <div className="bg-white rounded-2xl shadow-lg p-4 flex items-center justify-between">
          <div className="flex-1 text-center border-r border-gray-100">
            <p className="text-[#1565C0] text-xl font-bold" data-testid="text-total-rewards">
              {totalTaskRewards.toLocaleString()}
            </p>
            <p className="text-gray-500 text-[11px] mt-0.5">{currency} gagnés</p>
          </div>
          <div className="flex-1 text-center border-r border-gray-100">
            <p className="text-[#1565C0] text-xl font-bold">{completedCount}</p>
            <p className="text-gray-500 text-[11px] mt-0.5">Terminées</p>
          </div>
          <div className="flex-1 text-center">
            <p className="text-[#1565C0] text-xl font-bold">{claimableCount}</p>
            <p className="text-gray-500 text-[11px] mt-0.5">À réclamer</p>
          </div>
        </div>
      </div>

      {/* Tasks Section */}
      <div className="mx-4 mt-4 mb-24">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-[#1565C0]" />
            <h2 className="text-gray-800 font-bold text-sm">Paliers de parrainage</h2>
          </div>
          {claimableCount > 0 && (
            <button
              onClick={async () => {
                const claimable = tasks?.filter(t => t.canClaim && !t.isCompleted) || [];
                for (const task of claimable) {
                  try { await claimMutation.mutateAsync(task.id); } catch {}
                }
              }}
              disabled={claimMutation.isPending}
              className="text-xs text-[#1565C0] font-semibold bg-red-50 px-3 py-1.5 rounded-full"
              data-testid="button-claim-rewards"
            >
              Tout réclamer ({claimableCount})
            </button>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {Array(6).fill(0).map((_, i) => (
              <Skeleton key={i} className="h-28 w-full rounded-2xl" />
            ))}
          </div>
        ) : tasks && tasks.length > 0 ? (
          <div className="space-y-3">
            {tasks.map((task, index) => {
              const tier = TIER_COLORS[index] || TIER_COLORS[0];
              const label = TIER_LABELS[index] || `Palier ${index + 1}`;
              const icon = TIER_ICONS[index] || TIER_ICONS[0];
              const progress = Math.min((task.currentInvites / task.requiredInvites) * 100, 100);

              return (
                <div
                  key={task.id}
                  className={`bg-white rounded-2xl overflow-hidden shadow-sm border ${
                    task.isCompleted
                      ? "border-green-200"
                      : task.canClaim
                      ? "border-[#1565C0]/40"
                      : "border-gray-100"
                  }`}
                  data-testid={`task-item-${task.id}`}
                >
                  {/* Tier Header */}
                  <div className={`bg-gradient-to-r ${tier.bg} px-4 py-2.5 flex items-center justify-between`}>
                    <span className="text-white font-bold text-sm">{label}</span>
                    {task.isCompleted && <CheckCircle2 className="w-4 h-4 text-white" />}
                  </div>

                  {/* Task Body */}
                  <div className="p-3 flex items-center gap-3">
                    {/* Icon */}
                    <div className="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 bg-gray-50 flex items-center justify-center">
                      <img src={icon} alt={label} className="w-12 h-12 object-contain" />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-gray-700 text-xs leading-snug mb-0.5">
                        Inviter{" "}
                        <span className="font-bold text-gray-900">{task.requiredInvites}</span>{" "}
                        personnes à recharger
                      </p>
                      <p className="text-[#1565C0] font-bold text-base">
                        {task.reward.toLocaleString()} {currency}
                      </p>

                      {/* Progress */}
                      <div className="mt-1.5">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-gray-400 text-[10px]">
                            {task.currentInvites} / {task.requiredInvites} invitations
                          </span>
                          <span className="text-gray-400 text-[10px]">{Math.round(progress)}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              task.isCompleted ? "bg-green-500" : "bg-[#1565C0]"
                            }`}
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Action */}
                    <div className="flex-shrink-0">
                      {task.isCompleted ? (
                        <span className="bg-green-100 text-green-700 text-[10px] font-semibold px-2.5 py-1.5 rounded-full block text-center">
                          ✓ Fait
                        </span>
                      ) : task.canClaim ? (
                        <button
                          onClick={() => !claimMutation.isPending && claimMutation.mutate(task.id)}
                          disabled={claimMutation.isPending}
                          className="bg-[#1565C0] text-white text-[11px] font-semibold px-3 py-1.5 rounded-full active:scale-95 transition-transform shadow-sm"
                          data-testid={`button-claim-${task.id}`}
                        >
                          {claimMutation.isPending ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            "Réclamer"
                          )}
                        </button>
                      ) : (
                        <span className="bg-gray-100 text-gray-400 text-[10px] font-semibold px-2.5 py-1.5 rounded-full block text-center">
                          En cours
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-10 flex flex-col items-center gap-2">
            <img src={emptyIllustration} alt="Vide" className="w-40 h-40 object-contain opacity-90" />
            <p className="text-gray-500">Aucune tâche disponible</p>
          </div>
        )}
      </div>
    </div>
  );
}
