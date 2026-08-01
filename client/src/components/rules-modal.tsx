import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useQuery } from "@tanstack/react-query";

interface RulesModalProps {
  open: boolean;
  onClose: () => void;
}

export default function RulesModal({ open, onClose }: RulesModalProps) {
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
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Règles de la plateforme</DialogTitle>
        </DialogHeader>

        <ScrollArea className="h-[60vh] pr-4">
          <div className="space-y-4 text-sm text-muted-foreground">
            <section>
              <h4 className="font-medium text-foreground mb-2">1. Dépôts</h4>
              <ul className="space-y-1">
                <li>- Montant minimum : {parseInt(minDeposit).toLocaleString()} FCFA</li>
                <li>- Les dépôts sont traités dans les plus brefs délais</li>
                <li>- Assurez-vous que les informations de paiement sont correctes</li>
              </ul>
            </section>

            <section>
              <h4 className="font-medium text-foreground mb-2">2. Retraits</h4>
              <ul className="space-y-1">
                <li>- Montant minimum : {parseInt(minWithdrawal).toLocaleString()} FCFA</li>
                <li>- Frais de retrait : {withdrawalFees}%</li>
                <li>- Horaires : {withdrawalStartHour}h - {withdrawalEndHour}h</li>
                <li>- Maximum {maxWithdrawalsPerDay} retrait(s) par jour</li>
                <li>- Un produit actif est requis pour retirer</li>
                <li>- Un portefeuille de retrait doit être enregistré</li>
              </ul>
            </section>

            <section>
              <h4 className="font-medium text-foreground mb-2">3. Produits</h4>
              <ul className="space-y-1">
                <li>- Cycle standard : 80 jours</li>
                <li>- Gains journaliers automatiques</li>
                <li>- Les gains sont crédités 24h après l'achat</li>
                <li>- Produit gratuit : réclamez 50 FCFA/jour</li>
              </ul>
            </section>

            <section>
              <h4 className="font-medium text-foreground mb-2">4. Parrainage</h4>
              <ul className="space-y-1">
                <li>- Niveau 1 : {lv1}% de commission</li>
                <li>- Niveau 2 : {lv2}% de commission</li>
                <li>- Niveau 3 : {lv3}% de commission</li>
                <li>- Commissions sur les achats de produits</li>
              </ul>
            </section>

            <section>
              <h4 className="font-medium text-foreground mb-2">5. Bonus d'inscription</h4>
              <p>Chaque nouveau membre reçoit {parseInt(signupBonus).toLocaleString()} FCFA de bonus à l'inscription.</p>
            </section>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
