import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ChevronLeft, User } from "lucide-react";
import emptyIllustration from "@assets/illustration-8_1784762965573.png";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth";
import { getCountryByCode } from "@/lib/countries";

interface TeamMember {
  id: number;
  fullName: string;
  phone: string;
  country: string;
  createdAt: string;
  totalInvested: number;
}

interface TeamDetails {
  level1: TeamMember[];
  level2: TeamMember[];
  level3: TeamMember[];
  totalLevel1Invested: number;
  totalLevel2Invested: number;
  totalLevel3Invested: number;
}

function maskPhone(phone: string): string {
  if (phone.length <= 4) return phone;
  const last4 = phone.slice(-4);
  return `******${last4}`;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} ${hh}:${min}:${ss}`;
}

const GREEN = "#003366";
const GREEN_BG = "#e0f0ff";

export default function TeamDetailsPage() {
  const [activeLevel, setActiveLevel] = useState<1 | 2 | 3>(1);
  const [, navigate] = useLocation();
  const { user } = useAuth();

  const { data: team, isLoading } = useQuery<TeamDetails>({
    queryKey: ["/api/team/details"],
  });

  const country = getCountryByCode(user?.country || "");
  const currency = country?.currency || "FCFA";

  const levels = [
    {
      num: 1 as const,
      label: "Niveau 1",
      members: team?.level1 || [],
      totalInvested: team?.totalLevel1Invested || 0,
    },
    {
      num: 2 as const,
      label: "Niveau 2",
      members: team?.level2 || [],
      totalInvested: team?.totalLevel2Invested || 0,
    },
    {
      num: 3 as const,
      label: "Niveau 3",
      members: team?.level3 || [],
      totalInvested: team?.totalLevel3Invested || 0,
    },
  ];

  const activeData = levels[activeLevel - 1];
  const members = activeData.members;
  const memberCount = members.length;
  const totalInvested = activeData.totalInvested;

  return (
    <div className="min-h-screen flex flex-col bg-gray-100">

      {/* ── Header ── */}
      <div className="bg-white flex items-center px-4 py-4 shadow-sm">
        <button
          onClick={() => navigate("/team")}
          className="p-1 text-gray-600"
          data-testid="button-back-team"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
        <h1
          className="flex-1 text-center font-bold text-base pr-7"
          style={{ color: GREEN }}
          data-testid="text-page-title"
        >
          Historique d'équipe
        </h1>
      </div>

      {/* ── Level tabs ── */}
      <div className="bg-white border-b border-gray-100 flex">
        {levels.map((level) => (
          <button
            key={level.num}
            onClick={() => setActiveLevel(level.num)}
            className="flex-1 py-3 text-center text-sm font-medium relative"
            style={{ color: activeLevel === level.num ? GREEN : "#9ca3af" }}
            data-testid={`tab-level-${level.num}`}
          >
            {level.label}
            {activeLevel === level.num && (
              <span
                className="absolute bottom-0 left-4 right-4 h-0.5 rounded-full"
                style={{ backgroundColor: GREEN }}
              />
            )}
          </button>
        ))}
      </div>

      {/* ── Stats row ── */}
      <div className="mx-3 mt-3 flex gap-3">
        {/* Membres */}
        <div className="flex-1 bg-white rounded-2xl shadow-sm px-4 py-3">
          <p className="text-xs text-gray-400 mb-1">Membres de l'équipe</p>
          <p className="text-3xl font-black text-gray-900" data-testid="text-member-count">
            {isLoading ? "—" : memberCount}
          </p>
        </div>

        {/* Dépôts */}
        <div className="flex-1 bg-white rounded-2xl shadow-sm px-4 py-3">
          <p className="text-xs text-gray-400 mb-1">Dépôts de l'équipe</p>
          <p
            className="text-xl font-black"
            style={{ color: GREEN }}
            data-testid="text-total-invested"
          >
            {isLoading
              ? "—"
              : `${currency} ${Number(totalInvested).toLocaleString("fr-FR")}`}
          </p>
        </div>
      </div>

      {/* ── Members list ── */}
      <div className="mx-3 mt-3 mb-8 flex-1 space-y-2">
        {isLoading ? (
          Array(5).fill(0).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-2xl" />
          ))
        ) : members.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm text-center py-10 px-6 flex flex-col items-center gap-2">
            <img src={emptyIllustration} alt="Vide" className="w-40 h-40 object-contain opacity-90" />
            <p className="text-gray-500 text-sm font-medium">
              Aucun membre au niveau {activeLevel}
            </p>
            <p className="text-gray-400 text-xs mt-1">
              Invitez des amis pour agrandir votre équipe
            </p>
          </div>
        ) : (
          members.map((member) => (
            <div
              key={member.id}
              className="bg-white rounded-2xl shadow-sm flex items-center px-4 py-3 gap-3"
              data-testid={`team-member-${member.id}`}
            >
              {/* Green avatar circle */}
              <div
                className="w-11 h-11 rounded-full border-2 flex items-center justify-center shrink-0"
                style={{ borderColor: GREEN, backgroundColor: GREEN_BG }}
              >
                <User className="w-5 h-5" style={{ color: GREEN }} />
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p
                  className="text-sm font-semibold text-gray-800 truncate"
                  data-testid={`text-member-phone-${member.id}`}
                >
                  Compte : {maskPhone(member.phone)}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Date : {formatDate(member.createdAt)}
                </p>
              </div>

              {/* Amount */}
              <p
                className="text-sm font-bold shrink-0 text-gray-700"
                data-testid={`text-member-invested-${member.id}`}
              >
                {currency} {Number(member.totalInvested).toLocaleString("fr-FR")}
              </p>
            </div>
          ))
        )}
      </div>

    </div>
  );
}
