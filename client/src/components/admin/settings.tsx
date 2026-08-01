import { useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Loader2, Save, Link, Clock, Users, Zap } from "lucide-react";

const NETWORKS = [
  { value: "telegram", label: "Telegram" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "facebook", label: "Facebook" },
  { value: "instagram", label: "Instagram" },
  { value: "tiktok", label: "TikTok" },
  { value: "youtube", label: "YouTube" },
];

const settingsSchema = z.object({
  supportLink: z.string().min(5, "Lien requis"),
  supportType: z.string().min(1, "Réseau requis"),
  supportLabel: z.string().min(1, "Label requis"),
  support2Link: z.string().min(5, "Lien requis"),
  support2Type: z.string().min(1, "Réseau requis"),
  support2Label: z.string().min(1, "Label requis"),
  channelLink: z.string().min(5, "Lien requis"),
  channelType: z.string().min(1, "Réseau requis"),
  channelLabel: z.string().min(1, "Label requis"),
  groupLink: z.string().min(5, "Lien requis"),
  groupType: z.string().min(1, "Réseau requis"),
  groupLabel: z.string().min(1, "Label requis"),
  popupButtonLabel: z.string().min(1, "Label requis"),
  supportEnabled: z.boolean(),
  support2Enabled: z.boolean(),
  channelEnabled: z.boolean(),
  groupEnabled: z.boolean(),
  signupBonus: z.string().min(1, "Bonus requis"),
  minDeposit: z.string().min(1, "Montant requis"),
  minWithdrawal: z.string().min(1, "Montant requis"),
  withdrawalFees: z.string().min(1, "Frais requis"),
  maxWithdrawalsPerDay: z.string().min(1, "Requis"),
  withdrawalStartHour: z.string().min(1, "Heure requise"),
  withdrawalEndHour: z.string().min(1, "Heure requise"),
  level1Commission: z.string().min(1, "Commission requise"),
  level2Commission: z.string().min(1, "Commission requise"),
  level3Commission: z.string().min(1, "Commission requise"),
  sendavapayEnabled: z.boolean(),
  sendavapayChannelName: z.string().min(1, "Nom requis"),
  sendavapayWebhookSecret: z.string(),
});

type SettingsForm = z.infer<typeof settingsSchema>;

interface AdminSettingsProps {
  isSuperAdmin: boolean;
}

export default function AdminSettings({ isSuperAdmin }: AdminSettingsProps) {
  const { toast } = useToast();

  const { data: settings, isLoading } = useQuery<Record<string, string>>({
    queryKey: ["/api/admin/settings"],
  });

  const form = useForm<SettingsForm>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      supportLink: "https://t.me/doosangroup",
      supportType: "telegram",
      supportLabel: "Service client",
      support2Link: "https://t.me/doosangroup",
      support2Type: "telegram",
      support2Label: "Service client 2",
      channelLink: "https://t.me/doosangroup",
      channelType: "telegram",
      channelLabel: "Chaîne officielle",
      groupLink: "https://t.me/doosangroup",
      groupType: "telegram",
      groupLabel: "Groupe de discussion",
      popupButtonLabel: "Cliquez ici pour rejoindre le groupe Telegram",
      supportEnabled: true,
      support2Enabled: true,
      channelEnabled: true,
      groupEnabled: true,
      signupBonus: "500",
      minDeposit: "4000",
      minWithdrawal: "1500",
      withdrawalFees: "18",
      maxWithdrawalsPerDay: "1",
      withdrawalStartHour: "9",
      withdrawalEndHour: "17",
      level1Commission: "15",
      level2Commission: "2",
      level3Commission: "1",
    },
  });

  useEffect(() => {
    if (settings) {
      form.reset({
        supportLink: settings.supportLink || "https://t.me/doosangroup",
        supportType: settings.supportType || "telegram",
        supportLabel: settings.supportLabel || "Service client",
        support2Link: settings.support2Link || "https://t.me/doosangroup",
        support2Type: settings.support2Type || "telegram",
        support2Label: settings.support2Label || "Service client 2",
        channelLink: settings.channelLink || "https://t.me/doosangroup",
        channelType: settings.channelType || "telegram",
        channelLabel: settings.channelLabel || "Chaîne officielle",
        groupLink: settings.groupLink || "https://t.me/doosangroup",
        groupType: settings.groupType || "telegram",
        groupLabel: settings.groupLabel || "Groupe de discussion",
        popupButtonLabel: settings.popupButtonLabel || "Cliquez ici pour rejoindre le groupe Telegram",
        supportEnabled: settings.supportEnabled !== "false",
        support2Enabled: settings.support2Enabled !== "false",
        channelEnabled: settings.channelEnabled !== "false",
        groupEnabled: settings.groupEnabled !== "false",
        signupBonus: settings.signupBonus || "500",
        minDeposit: settings.minDeposit || "4000",
        minWithdrawal: settings.minWithdrawal || "1500",
        withdrawalFees: settings.withdrawalFees || "18",
        maxWithdrawalsPerDay: settings.maxWithdrawalsPerDay || "1",
        withdrawalStartHour: settings.withdrawalStartHour || "9",
        withdrawalEndHour: settings.withdrawalEndHour || "17",
        level1Commission: settings.level1Commission || "15",
        level2Commission: settings.level2Commission || "2",
        level3Commission: settings.level3Commission || "1",
        sendavapayEnabled: settings.sendavapayEnabled === "true",
        sendavapayChannelName: settings.sendavapayChannelName || "SendavaPay",
        sendavapayWebhookSecret: settings.sendavapayWebhookSecret || "",
      });
    }
  }, [settings, form]);

  const updateMutation = useMutation({
    mutationFn: async (data: SettingsForm) => {
      const serialized = {
        ...data,
        supportEnabled: String(data.supportEnabled),
        support2Enabled: String(data.support2Enabled),
        channelEnabled: String(data.channelEnabled),
        groupEnabled: String(data.groupEnabled),
        sendavapayEnabled: String(data.sendavapayEnabled),
      };
      const response = await apiRequest("POST", "/api/admin/settings", serialized);
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.message || "Erreur");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/links"] });
      toast({ title: "Paramètres enregistrés !" });
    },
    onError: (error: any) => {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return <Skeleton className="h-96" />;
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((data) => updateMutation.mutate(data))} className="space-y-4">

        {/* ── Liens & Réseaux sociaux ── */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Link className="w-5 h-5 text-primary" />
              Liens & Réseaux sociaux
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">

            {/* Support 1 */}
            <div className="space-y-2 border rounded-xl p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Lien 1 — Service client</p>
                <FormField control={form.control} name="supportEnabled" render={({ field }) => (
                  <FormItem className="flex items-center gap-2 space-y-0">
                    <FormLabel className="text-xs text-gray-500">{field.value ? "Actif" : "Désactivé"}</FormLabel>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <FormField control={form.control} name="supportLabel" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Libellé affiché</FormLabel>
                    <FormControl><Input {...field} placeholder="Service client" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="supportType" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Réseau social</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger><SelectValue placeholder="Réseau..." /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {NETWORKS.map(n => <SelectItem key={n.value} value={n.value}>{n.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <FormField control={form.control} name="supportLink" render={({ field }) => (
                <FormItem>
                  <FormLabel>Lien URL</FormLabel>
                  <FormControl><Input {...field} placeholder="https://t.me/..." /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            {/* Support 2 */}
            <div className="space-y-2 border rounded-xl p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Lien 2 — Service client</p>
                <FormField control={form.control} name="support2Enabled" render={({ field }) => (
                  <FormItem className="flex items-center gap-2 space-y-0">
                    <FormLabel className="text-xs text-gray-500">{field.value ? "Actif" : "Désactivé"}</FormLabel>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <FormField control={form.control} name="support2Label" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Libellé affiché</FormLabel>
                    <FormControl><Input {...field} placeholder="Service client 2" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="support2Type" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Réseau social</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger><SelectValue placeholder="Réseau..." /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {NETWORKS.map(n => <SelectItem key={n.value} value={n.value}>{n.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <FormField control={form.control} name="support2Link" render={({ field }) => (
                <FormItem>
                  <FormLabel>Lien URL</FormLabel>
                  <FormControl><Input {...field} placeholder="https://t.me/..." /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            {/* Channel */}
            <div className="space-y-2 border rounded-xl p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Lien 3 — Chaîne officielle</p>
                <FormField control={form.control} name="channelEnabled" render={({ field }) => (
                  <FormItem className="flex items-center gap-2 space-y-0">
                    <FormLabel className="text-xs text-gray-500">{field.value ? "Actif" : "Désactivé"}</FormLabel>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <FormField control={form.control} name="channelLabel" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Libellé affiché</FormLabel>
                    <FormControl><Input {...field} placeholder="Chaîne officielle" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="channelType" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Réseau social</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger><SelectValue placeholder="Réseau..." /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {NETWORKS.map(n => <SelectItem key={n.value} value={n.value}>{n.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <FormField control={form.control} name="channelLink" render={({ field }) => (
                <FormItem>
                  <FormLabel>Lien URL</FormLabel>
                  <FormControl><Input {...field} placeholder="https://t.me/..." /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            {/* Group */}
            <div className="space-y-2 border rounded-xl p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Lien 4 — Groupe de discussion</p>
                <FormField control={form.control} name="groupEnabled" render={({ field }) => (
                  <FormItem className="flex items-center gap-2 space-y-0">
                    <FormLabel className="text-xs text-gray-500">{field.value ? "Actif" : "Désactivé"}</FormLabel>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <FormField control={form.control} name="groupLabel" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Libellé affiché</FormLabel>
                    <FormControl><Input {...field} placeholder="Groupe de discussion" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="groupType" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Réseau social</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger><SelectValue placeholder="Réseau..." /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {NETWORKS.map(n => <SelectItem key={n.value} value={n.value}>{n.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <FormField control={form.control} name="groupLink" render={({ field }) => (
                <FormItem>
                  <FormLabel>Lien URL</FormLabel>
                  <FormControl><Input {...field} placeholder="https://t.me/..." /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            {/* Popup dashboard button */}
            <div className="border border-red-500 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500 shrink-0" />
                <p className="text-sm font-semibold text-red-600">Bouton du popup sur le tableau de bord</p>
              </div>
              <p className="text-xs text-muted-foreground">
                Ce bouton apparaît dans la fenêtre d'avertissement qui s'ouvre automatiquement sur l'accueil.
              </p>
              <FormField control={form.control} name="popupButtonLabel" render={({ field }) => (
                <FormItem>
                  <FormLabel>Texte du bouton <span className="text-red-500">(popup dashboard)</span></FormLabel>
                  <FormControl><Input {...field} placeholder="Ex: Cliquez ici pour rejoindre le groupe Telegram" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="groupLink" render={({ field }) => (
                <FormItem>
                  <FormLabel>Lien du bouton <span className="text-red-500">(popup dashboard)</span></FormLabel>
                  <FormControl><Input {...field} placeholder="https://t.me/..." /></FormControl>
                  <FormDescription>Ce lien est aussi utilisé dans le popup de bienvenue du tableau de bord.</FormDescription>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

          </CardContent>
        </Card>

        {/* ── Retraits & Bonus ── */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="w-5 h-5 text-primary" />
              Retraits & Bonus
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField control={form.control} name="signupBonus" render={({ field }) => (
              <FormItem>
                <FormLabel>Bonus d'inscription (FCFA)</FormLabel>
                <FormControl><Input {...field} type="number" min="0" /></FormControl>
                <FormDescription>Montant offert à chaque nouvel utilisateur à l'inscription.</FormDescription>
                <FormMessage />
              </FormItem>
            )} />

            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="minDeposit" render={({ field }) => (
                <FormItem>
                  <FormLabel>Dépôt minimum (FCFA)</FormLabel>
                  <FormControl><Input {...field} type="number" min="0" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="minWithdrawal" render={({ field }) => (
                <FormItem>
                  <FormLabel>Retrait minimum (FCFA)</FormLabel>
                  <FormControl><Input {...field} type="number" min="0" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="withdrawalFees" render={({ field }) => (
                <FormItem>
                  <FormLabel>Frais de retrait (%)</FormLabel>
                  <FormControl><Input {...field} type="number" min="0" max="100" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="maxWithdrawalsPerDay" render={({ field }) => (
                <FormItem>
                  <FormLabel>Max retraits / jour</FormLabel>
                  <FormControl><Input {...field} type="number" min="1" max="10" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="withdrawalStartHour" render={({ field }) => (
                <FormItem>
                  <FormLabel>Heure début retraits</FormLabel>
                  <FormControl><Input {...field} type="number" min="0" max="23" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="withdrawalEndHour" render={({ field }) => (
                <FormItem>
                  <FormLabel>Heure fin retraits</FormLabel>
                  <FormControl><Input {...field} type="number" min="0" max="23" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
          </CardContent>
        </Card>

        {/* ── Commissions ── */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              Commissions de parrainage
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              <FormField control={form.control} name="level1Commission" render={({ field }) => (
                <FormItem>
                  <FormLabel>Niveau 1 (%)</FormLabel>
                  <FormControl><Input {...field} type="number" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="level2Commission" render={({ field }) => (
                <FormItem>
                  <FormLabel>Niveau 2 (%)</FormLabel>
                  <FormControl><Input {...field} type="number" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="level3Commission" render={({ field }) => (
                <FormItem>
                  <FormLabel>Niveau 3 (%)</FormLabel>
                  <FormControl><Input {...field} type="number" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
          </CardContent>
        </Card>

        {/* ── SendavaPay ── */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="w-5 h-5 text-blue-500" />
              SendavaPay — Paiement automatique
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-xl border p-3">
              <div>
                <p className="text-sm font-semibold text-gray-800">Activer SendavaPay</p>
                <p className="text-xs text-gray-500">Affiche l'option de paiement automatique Mobile Money</p>
              </div>
              <FormField control={form.control} name="sendavapayEnabled" render={({ field }) => (
                <FormItem className="flex items-center gap-2 space-y-0">
                  <FormLabel className="text-xs text-gray-500">{field.value ? "Actif" : "Désactivé"}</FormLabel>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )} />
            </div>
            <FormField control={form.control} name="sendavapayChannelName" render={({ field }) => (
              <FormItem>
                <FormLabel>Nom du canal affiché</FormLabel>
                <FormControl><Input {...field} placeholder="SendavaPay" /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="sendavapayWebhookSecret" render={({ field }) => (
              <FormItem>
                <FormLabel>Webhook Secret</FormLabel>
                <FormControl><Input {...field} type="password" placeholder="whsec_..." /></FormControl>
                <FormDescription className="text-xs">Vous pouvez aussi configurer SENDAVAPAY_WEBHOOK_SECRET dans les Secrets/variables d'environnement du serveur. Cette variable est prioritaire. Laissez les deux champs vides uniquement si vous désactivez la vérification de signature.</FormDescription>
                <FormMessage />
              </FormItem>
            )} />
            <div className="rounded-xl bg-blue-50 border border-blue-100 p-3 text-xs text-blue-700 space-y-1">
              <p className="font-semibold">Configuration requise :</p>
              <p>1. Ajoutez la variable d'environnement <code className="bg-blue-100 px-1 rounded">SENDAVAPAY_API_KEY</code> avec votre clé SDK (commence par <code className="bg-blue-100 px-1 rounded">sdk_</code>)</p>
              <p>2. Ajoutez le secret Webhook dans SENDAVAPAY_WEBHOOK_SECRET, puis configurez l'URL webhook dans votre compte SendavaPay : <code className="bg-blue-100 px-1 rounded">/api/webhooks/sendavapay</code></p>
            </div>
          </CardContent>
        </Card>

        <Button type="submit" className="w-full" disabled={updateMutation.isPending}>
          {updateMutation.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <>
              <Save className="w-4 h-4 mr-2" />
              Enregistrer les paramètres
            </>
          )}
        </Button>
      </form>
    </Form>
  );
}
