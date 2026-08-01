import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import { getCountryByCode } from "@/lib/countries";

export default function SalaryBonusPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();

  const { data: teamStats } = useQuery<any>({
    queryKey: ["/api/team/stats"],
  });

  if (!user) return null;

  const country = getCountryByCode(user.country);
  const currency = country?.currency || "FCFA";
  const level1Count = teamStats?.level1Count || 0;
  const totalCommission = parseFloat(teamStats?.totalCommission || "0");
  const totalPeople = (teamStats?.level1Count || 0) + (teamStats?.level2Count || 0) + (teamStats?.level3Count || 0);

  const levels = [
    { lv: 1, required: 3,   reward: 1000  },
    { lv: 2, required: 10,  reward: 3000  },
    { lv: 3, required: 30,  reward: 5000  },
    { lv: 4, required: 50,  reward: 10000 },
    { lv: 5, required: 100, reward: 20000 },
    { lv: 6, required: 200, reward: 50000 },
  ];

  return (
    <div className="flex flex-col min-h-screen" style={{ background: "#F0F2F5" }}>

      {/* ── Header ── */}
      <div className="flex items-center gap-3 px-4 pt-6 pb-4 bg-white shadow-sm">
        <button
          onClick={() => navigate("/account")}
          className="w-9 h-9 rounded-full flex items-center justify-center bg-gray-100"
          data-testid="button-back"
        >
          <ChevronLeft className="w-5 h-5 text-gray-700" />
        </button>
        <p className="flex-1 text-center text-gray-900 font-extrabold text-lg pr-9">
          Centre des tâches
        </p>
      </div>

      <div className="flex-1 overflow-y-auto pb-24 px-4 pt-4 space-y-3">

        {/* ── Stats card ── */}
        <div
          className="rounded-2xl px-6 py-5 flex items-center"
          style={{ background: "linear-gradient(120deg, #003087, #0047AB)" }}
        >
          <div className="flex-1 text-center">
            <p className="text-white font-extrabold text-2xl">{currency} {totalCommission.toFixed(0)}</p>
            <p className="text-white/70 text-xs mt-1">Total des récompenses</p>
          </div>
          <div className="w-px h-12 bg-white/30" />
          <div className="flex-1 text-center">
            <p className="text-white font-extrabold text-2xl">{totalPeople}</p>
            <p className="text-white/70 text-xs mt-1">Total de personnes</p>
          </div>
        </div>

        {/* ── Level cards ── */}
        {levels.map(({ lv, required, reward }) => {
          const current = level1Count;
          const reached = current >= required;
          const progress = Math.min(current, required);

          return (
            <div
              key={lv}
              className="rounded-2xl overflow-hidden shadow-sm flex"
              style={{ background: "#fff" }}
              data-testid={`level-card-${lv}`}
            >
              {/* Purple left bar */}
              <div
                className="flex items-center justify-center px-4 py-5"
                style={{ background: "linear-gradient(160deg, #003087, #0047AB)", minWidth: 72 }}
              >
                <p className="text-white font-extrabold text-lg">Lv{lv}</p>
              </div>

              {/* Content */}
              <div className="flex-1 px-4 py-4">
                <p className="text-gray-700 text-xs text-center leading-snug mb-3">
                  Invitez <span className="font-bold text-gray-900">{required}</span> investisseurs de niveau 1 pour obtenir :{" "}
                  <span className="font-bold" style={{ color: "#0047AB" }}>{currency} {reward.toLocaleString()}</span>
                </p>

                {/* Stats row */}
                <div className="flex justify-around mb-3">
                  <div className="text-center">
                    <p className="text-gray-900 font-extrabold text-base">{current}</p>
                    <p className="text-gray-400 text-xs">Actuel</p>
                  </div>
                  <div className="text-center">
                    <p className="text-gray-900 font-extrabold text-base">{required}</p>
                    <p className="text-gray-400 text-xs">Objectif</p>
                  </div>
                  <div className="text-center">
                    <p className="text-gray-900 font-extrabold text-base">{progress}/{required}</p>
                    <p className="text-gray-400 text-xs">Progression</p>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="w-full h-1.5 rounded-full bg-gray-100 mb-3">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${(progress / required) * 100}%`,
                      background: "linear-gradient(90deg, #0047AB, #1a6fd4)",
                    }}
                  />
                </div>

                {/* Button */}
                <button
                  className="w-full py-2.5 rounded-xl text-sm font-bold transition-all"
                  style={reached
                    ? { background: "linear-gradient(90deg, #003087, #0047AB)", color: "#fff" }
                    : { background: "#F3F4F6", color: "#6B7280" }
                  }
                  data-testid={`button-level-${lv}`}
                >
                  {reached ? "Réclamer" : "En cours"}
                </button>
              </div>
            </div>
          );
        })}

      </div>
    </div>
  );
}
