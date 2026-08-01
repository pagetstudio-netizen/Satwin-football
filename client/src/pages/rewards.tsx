import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, HelpCircle, Users } from "lucide-react";
import { getCountryByCode } from "@/lib/countries";

import globeImg from "@/assets/images/elf-station-2.jpeg";

export default function RewardsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const { data: tasks, isLoading } = useQuery<any[]>({
    queryKey: ["/api/tasks"],
  });

  const claimMutation = useMutation({
    mutationFn: async (taskId: number) => {
      const res = await apiRequest("POST", `/api/tasks/${taskId}/claim`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Erreur");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      toast({
        title: "Felicitations",
        description: "Recompense recue avec succes !",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erreur",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  if (!user) return null;

  const country = getCountryByCode(user.country);
  const currency = country?.currency || "FCFA";

  const totalReward = tasks?.reduce((sum, t) => sum + t.reward, 0) || 0;
  const claimedReward = tasks?.filter(t => t.isCompleted).reduce((sum: number, t: any) => sum + t.reward, 0) || 0;
  const currentInvites = tasks?.[0]?.currentInvites || 0;

  return (
    <div className="flex flex-col min-h-full bg-gray-100">
      <div className="flex-1 overflow-y-auto pb-24">

        <div className="relative px-4 pt-4 pb-6" style={{ background: "linear-gradient(180deg, #e3f2fd 0%, #f5f5f5 100%)" }}>
          <button onClick={() => navigate("/account")} className="mb-3" data-testid="button-back">
            <ArrowLeft className="w-6 h-6 text-gray-700" />
          </button>
          <h1 className="text-xl font-bold text-gray-900 mb-4">Recevoir</h1>

          <div className="relative rounded-2xl overflow-hidden" style={{ backgroundColor: "#2196F3" }}>
            <img src={globeImg} alt="" className="absolute inset-0 w-full h-full object-cover opacity-20" />
            <div className="relative z-10 flex items-center justify-between px-5 py-5">
              <div>
                <p className="text-white/80 text-sm">{currency}</p>
                <p className="text-white text-3xl font-black" data-testid="text-claimed-reward">{claimedReward.toLocaleString()}</p>
                <p className="text-white/70 text-xs mt-1">
                  Remplissez ces taches pour obtenir {totalReward.toLocaleString()} {currency}
                </p>
              </div>
              <div className="flex flex-col items-center gap-2">
                <HelpCircle className="w-6 h-6 text-white/60" />
              </div>
            </div>
          </div>
        </div>

        <div className="px-4 mt-2">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1 h-5 rounded-full" style={{ backgroundColor: "#2196F3" }} />
            <h2 className="text-base font-bold text-gray-900">Liste des taches</h2>
          </div>

          {isLoading ? (
            <div className="bg-white rounded-xl p-6 text-center text-gray-400 text-sm">
              Chargement...
            </div>
          ) : (
            <div className="bg-white rounded-xl overflow-hidden shadow-sm border border-gray-100">
              {tasks?.map((task, index) => (
                <div
                  key={task.id}
                  className={`flex items-center px-4 py-4 gap-3 ${index < (tasks.length - 1) ? "border-b border-gray-100" : ""}`}
                  data-testid={`task-item-${task.id}`}
                >
                  <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ backgroundColor: "#e3f2fd" }}>
                    <Users className="w-5 h-5" style={{ color: "#2196F3" }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{task.description}</p>
                    <p className="text-xs text-gray-400 mt-0.5">Recompense: {task.reward.toLocaleString()} {currency}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-gray-500">({task.currentInvites}/{task.requiredInvites})</span>
                    {task.isCompleted ? (
                      <span className="text-xs font-semibold px-3 py-1.5 rounded-md bg-green-50 text-green-600" data-testid={`task-completed-${task.id}`}>
                        Complet
                      </span>
                    ) : task.canClaim ? (
                      <button
                        onClick={() => claimMutation.mutate(task.id)}
                        disabled={claimMutation.isPending}
                        className="text-xs font-semibold px-3 py-1.5 rounded-md text-white"
                        style={{ backgroundColor: "#2196F3" }}
                        data-testid={`button-claim-${task.id}`}
                      >
                        Recevoir
                      </button>
                    ) : (
                      <span className="text-xs font-semibold px-3 py-1.5 rounded-md bg-gray-100 text-gray-400" data-testid={`task-locked-${task.id}`}>
                        Recu
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
