import { ChevronLeft } from "lucide-react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";

export default function RulesPage() {
  const { data: settings } = useQuery<Record<string, string>>({
    queryKey: ["/api/settings"],
  });

  const signupBonus = settings?.signupBonus || "500";
  const minDeposit = settings?.minDeposit || "4000";
  const minWithdrawal = settings?.minWithdrawal || "1500";
  const withdrawalFees = settings?.withdrawalFees || "18";
  const withdrawalStartHour = settings?.withdrawalStartHour || "9";
  const withdrawalEndHour = settings?.withdrawalEndHour || "17";
  const maxWithdrawalsPerDay = settings?.maxWithdrawalsPerDay || "1";
  const lv1 = settings?.level1Commission || "15";
  const lv2 = settings?.level2Commission || "2";
  const lv3 = settings?.level3Commission || "1";

  return (
    <div className="flex flex-col min-h-full bg-white">
      <header className="flex items-center px-4 py-3 border-b bg-white">
        <Link href="/account">
          <button className="p-1" data-testid="button-back">
            <ChevronLeft className="w-6 h-6 text-gray-600" />
          </button>
        </Link>
        <h1 className="flex-1 text-center text-lg font-semibold text-gray-800 pr-6">Règles de la plateforme</h1>
      </header>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-[#2196F3] border-l-4 border-[#2196F3] pl-3">1. Investissement</h2>
          <ul className="list-disc pl-5 space-y-2 text-gray-600 text-sm">
            <li>Chaque utilisateur peut posséder plusieurs produits d'investissement simultanément.</li>
            <li>Les revenus sont générés quotidiennement et accrédités sur votre solde de compte toutes les 24 heures.</li>
            <li>Le cycle d'investissement standard est de 80 jours, sauf indication contraire pour les produits spéciaux.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-[#2196F3] border-l-4 border-[#2196F3] pl-3">2. Dépôts et Retraits</h2>
          <ul className="list-disc pl-5 space-y-2 text-gray-600 text-sm">
            <li>Le montant minimum de dépôt est de {parseInt(minDeposit).toLocaleString()} FCFA.</li>
            <li>Le montant minimum de retrait est de {parseInt(minWithdrawal).toLocaleString()} FCFA.</li>
            <li>Les frais de retrait sont fixés à {withdrawalFees}% pour couvrir les frais de transaction et d'entretien.</li>
            <li>Les retraits sont traités entre {withdrawalStartHour}h et {withdrawalEndHour}h les jours ouvrables.</li>
            <li>Limite de {maxWithdrawalsPerDay} retrait(s) maximum par jour par utilisateur.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-[#2196F3] border-l-4 border-[#2196F3] pl-3">3. Système de Parrainage</h2>
          <ul className="list-disc pl-5 space-y-2 text-gray-600 text-sm">
            <li>Commission de niveau 1 : {lv1}% sur le PREMIER investissement du filleul.</li>
            <li>Commission de niveau 2 : {lv2}% sur le PREMIER investissement du filleul.</li>
            <li>Commission de niveau 3 : {lv3}% sur le PREMIER investissement du filleul.</li>
            <li>Les activités frauduleuses ou la création de comptes multiples pour manipuler le système entraîneront la suspension du compte.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-[#2196F3] border-l-4 border-[#2196F3] pl-3">4. Bonus d'inscription</h2>
          <ul className="list-disc pl-5 space-y-2 text-gray-600 text-sm">
            <li>Chaque nouveau membre reçoit {parseInt(signupBonus).toLocaleString()} FCFA de bonus à l'inscription.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-[#2196F3] border-l-4 border-[#2196F3] pl-3">5. Sécurité</h2>
          <ul className="list-disc pl-5 space-y-2 text-gray-600 text-sm">
            <li>Vous êtes responsable de la sécurité de votre mot de passe.</li>
            <li>Ne partagez jamais vos identifiants de connexion avec des tiers.</li>
            <li>Le service client officiel ne vous demandera jamais votre mot de passe.</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
