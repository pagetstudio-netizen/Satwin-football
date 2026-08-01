import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { useLocation } from "wouter";

const GREEN = "#15803d";

interface LinksSettings {
  supportLink: string; support2Link: string; channelLink: string; groupLink: string;
  supportType: string; support2Type: string; channelType: string; groupType: string;
  supportLabel: string; support2Label: string; channelLabel: string; groupLabel: string;
  supportEnabled: boolean; support2Enabled: boolean; channelEnabled: boolean; groupEnabled: boolean;
  withdrawalStartHour: string; withdrawalEndHour: string;
}

export default function ServicePage() {
  const [, navigate] = useLocation();

  const { data: settings } = useQuery<LinksSettings>({
    queryKey: ["/api/settings/links"],
  });

  const allLinks = [
    {
      label: settings?.supportLabel   || "Service client",
      href:  settings?.supportLink    || "https://t.me/doosangroup",
      enabled: settings?.supportEnabled  === true,
      testId: "button-support-link",
    },
    {
      label: settings?.support2Label  || "Service client 2",
      href:  settings?.support2Link   || "https://t.me/doosangroup",
      enabled: settings?.support2Enabled === true,
      testId: "button-support2-link",
    },
    {
      label: settings?.channelLabel   || "Chaîne officielle",
      href:  settings?.channelLink    || "https://t.me/doosangroup",
      enabled: settings?.channelEnabled  === true,
      testId: "button-channel-link",
    },
    {
      label: settings?.groupLabel     || "Groupe de discussion",
      href:  settings?.groupLink      || "https://t.me/doosangroup",
      enabled: settings?.groupEnabled    === true,
      testId: "button-group-link",
    },
  ];
  const links = allLinks.filter(l => l.enabled);

  return (
    <div style={{ minHeight: "100vh", background: "#f0f0f0", display: "flex", flexDirection: "column" }}>

      {/* ── Green header ── */}
      <div style={{ background: GREEN, display: "flex", alignItems: "center", padding: "12px 16px" }}>
        <button onClick={() => navigate("/account")} style={{ background: "none", border: "none", cursor: "pointer", color: "white", fontSize: 22, padding: "0 10px 0 0" }}>‹</button>
        <h1 style={{ flex: 1, textAlign: "center", color: "white", fontWeight: 700, fontSize: 17, margin: 0 }}>CS</h1>
        <div style={{ width: 34 }} />
      </div>

      {/* ── Hero section with teal wave background ── */}
      <div style={{ position: "relative", background: "linear-gradient(160deg, #4dd9d0 0%, #7ee8e0 40%, #b2f0eb 65%, #e8f8f7 80%, #f3f3f3 100%)", paddingBottom: 60, textAlign: "center" }}>

        {/* White curved bottom */}
        <div style={{
          position: "absolute", bottom: 0, left: 0, right: 0, height: 80,
          background: "#f0f0f0",
          borderRadius: "50% 50% 0 0 / 100% 100% 0 0",
        }} />

        {/* Agent photo circle */}
        <div style={{ position: "relative", display: "inline-block", marginTop: 32 }}>
          <div style={{
            width: 130, height: 130, borderRadius: "50%",
            overflow: "hidden", background: "#d4f0f7",
            border: "4px solid white",
            boxShadow: "0 4px 20px rgba(0,0,0,0.12)",
            position: "relative", zIndex: 2,
          }}>
            <img src="/cs-agent.png" alt="Agent" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </div>
          {/* "En marche" badge */}
          <div style={{
            position: "absolute", top: 8, right: -10, zIndex: 3,
            background: "#e91e63", borderRadius: 12, padding: "3px 10px",
          }}>
            <span style={{ color: "white", fontSize: 11, fontWeight: 700 }}>En marche</span>
          </div>
        </div>

        {/* Text */}
        <div style={{ position: "relative", zIndex: 2, marginTop: 16, padding: "0 24px 0" }}>
          <h2 style={{ color: "#1a7a9a", fontWeight: 700, fontSize: 24, margin: "0 0 8px" }}>Bienvenue</h2>
          <p style={{ color: "#4a5568", fontSize: 14, lineHeight: 1.6, margin: 0 }}>
            Bienvenue au service client, que puis-je faire pour vous aujourd'hui?
          </p>
        </div>

        {/* Spacer to push into next section */}
        <div style={{ height: 40 }} />
      </div>

      {/* ── Link cards ── */}
      <div style={{ padding: "12px 16px 80px", display: "flex", flexDirection: "column", gap: 12 }}>
        {links.map((link, i) => (
          <button
            key={link.testId}
            data-testid={link.testId}
            onClick={() => window.open(link.href, "_blank")}
            style={{
              width: "100%", border: "none", cursor: "pointer", textAlign: "left",
              background: "linear-gradient(135deg, #f5a623 0%, #f7b948 50%, #f5a623 100%)",
              borderRadius: 12, padding: "18px 18px 18px 20px",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              boxShadow: "0 4px 14px rgba(245,166,35,0.35)",
            }}
          >
            <div>
              <p style={{ color: "white", fontWeight: 800, fontSize: 16, margin: "0 0 4px" }}>
                {link.label}
              </p>
              <p style={{ color: "rgba(255,255,255,0.85)", fontSize: 12, margin: "0 0 2px" }}>Support client principal</p>
              <p style={{ color: "rgba(255,255,255,0.85)", fontSize: 12, margin: 0 }}>Service en ligne dédié 7/24 heures</p>
            </div>
            <ChevronRight size={22} color="white" style={{ flexShrink: 0 }} />
          </button>
        ))}
      </div>

    </div>
  );
}
