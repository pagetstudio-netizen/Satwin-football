import { useLocation } from "wouter";

const GREEN = "#15803d";

export default function AboutPage() {
  const [, navigate] = useLocation();

  return (
    <div style={{ minHeight: "100vh", background: "#f5f5f5", display: "flex", flexDirection: "column" }}>

      {/* ── Header ── */}
      <div style={{
        background: GREEN, display: "flex", alignItems: "center",
        padding: "12px 16px", flexShrink: 0,
      }}>
        <button
          onClick={() => navigate("/" as any)}
          style={{ background: "none", border: "none", cursor: "pointer",
            color: "white", fontSize: 22, lineHeight: 1, padding: "0 8px 0 0" }}
        >
          ‹
        </button>
        <h1 style={{ flex: 1, textAlign: "center", color: "white",
          fontWeight: 700, fontSize: 17, margin: 0 }}>
          Histoire de la plateforme
        </h1>
        <div style={{ width: 32 }} />
      </div>

      {/* ── Content ── */}
      <div style={{ flex: 1, overflowY: "auto", paddingBottom: 80 }}>

        {/* Logo card */}
        <div style={{
          margin: "18px 16px 0",
          background: "white", borderRadius: 14,
          padding: "24px 16px",
          display: "flex", flexDirection: "column", alignItems: "center",
          boxShadow: "0 2px 10px rgba(0,0,0,0.07)",
        }}>
          <img
            src="/about/logo.jpg"
            alt="SATWIN FOOT"
            style={{ width: 130, height: 130, objectFit: "contain", marginBottom: 10 }}
          />
          <p style={{ color: GREEN, fontWeight: 800, fontSize: 20, margin: 0, letterSpacing: 1 }}>
            SATWIN FOOT
          </p>
          <p style={{ color: "#6b7280", fontSize: 13, margin: "4px 0 0", textAlign: "center" }}>
            Plateforme d'investissement football
          </p>
        </div>

        {/* History text card */}
        <div style={{
          margin: "14px 16px 0",
          background: "white", borderRadius: 14,
          padding: "20px 18px",
          boxShadow: "0 2px 10px rgba(0,0,0,0.07)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <div style={{ width: 4, height: 20, background: GREEN, borderRadius: 2 }} />
            <h2 style={{ fontSize: 15, fontWeight: 700, color: "#111827", margin: 0 }}>
              Historique de la plateforme
            </h2>
          </div>

          {[
            `SATWIN FOOT est une plateforme de paris inversés sur les résultats des matchs de football. Enregistrée en Estonie en 2020, elle s'appuie sur un cadre juridique solide et transparent pour offrir à ses membres une expérience d'investissement sportif sécurisée. Le marché actuel couvre l'Amérique du Sud, l'Asie, l'Afrique et certaines parties de l'Europe.`,
            `Le siège social et le site Web sont situés en Estonie (Europe). Il s'agit d'une société légale d'investissement dans les événements sportifs sur Internet strictement réglementée et agréée. Des relations établies avec les plus grandes sociétés d'événements sportifs au monde. Le financement provient principalement des grands matchs internationaux de football visibles sur la plateforme et sur Internet, garantissant l'équité, l'impartialité et la transparence. Le contenu principal de la plateforme d'investissement dans le football SATWIN FOOT est de fournir aux clients des outils d'avertissement et de gestion financière et de faire gagner beaucoup de temps aux clients pour trouver une source de revenus stable.`,
            `Contrairement à toute autre plateforme sur le marché, nous mettons le contrôle financier entre les mains de nos clients. Après des années de recherches, nous avons commencé notre activité en découvrant aux clients des outils d'avertissement performants. Les matchs de football accordent plus d'attention à la gestion financière plutôt qu'au jeu, afin que les gens puissent avoir un revenu stable à long terme.`,
            `En août 2026, la plateforme SATWIN FOOT est entrée avec succès dans la région africaine avec plus de 5 millions de membres. Reconnaissant de vous rencontrer, reconnaissant de vous avoir !`,
          ].map((para, i) => (
            <p key={i} style={{
              fontSize: 13.5, color: "#374151", lineHeight: 1.8,
              marginBottom: i < 3 ? 14 : 0, margin: i < 3 ? "0 0 14px" : 0,
            }}>
              {para}
            </p>
          ))}
        </div>

        {/* Mission card */}
        <div style={{
          margin: "14px 16px 0",
          background: GREEN, borderRadius: 14,
          padding: "20px 18px",
          boxShadow: "0 4px 14px rgba(21,128,61,0.25)",
        }}>
          <p style={{ color: "white", fontWeight: 800, fontSize: 15, margin: "0 0 10px", textAlign: "center" }}>
            SATWIN FOOTBALL – IS NOT A GAME
          </p>
          <p style={{ color: "rgba(255,255,255,0.9)", fontSize: 13, lineHeight: 1.7, margin: "0 0 12px", textAlign: "center" }}>
            Nor is it a traditional betting platform. <strong style={{ color: "white" }}>Instead,</strong> it represents a brand-new experience in sports betting.
          </p>
          <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: "12px 14px" }}>
            <p style={{ color: "white", fontSize: 13, lineHeight: 1.7, margin: 0 }}>
              <strong>SATWIN FOOTBALL</strong> enables <span style={{ color: "#fde047" }}>smart bets</span> to evolve from emotions into <span style={{ color: "#fde047" }}>real opportunities</span>. Our goal is to build a safe, fair, and innovative platform that rewards intelligence, strategy, and passion for football.
            </p>
          </div>
        </div>

        {/* Photos section */}
        <div style={{ margin: "14px 16px 0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <div style={{ width: 4, height: 20, background: GREEN, borderRadius: 2 }} />
            <h2 style={{ fontSize: 15, fontWeight: 700, color: "#111827", margin: 0 }}>
              Nos événements
            </h2>
          </div>

          {/* Photo 1 */}
          <div style={{
            background: "white", borderRadius: 14, overflow: "hidden",
            boxShadow: "0 2px 10px rgba(0,0,0,0.07)", marginBottom: 12,
          }}>
            <img
              src="/about/event2.png"
              alt="Événement SATWIN FOOTBALL"
              style={{ width: "100%", height: 200, objectFit: "cover", display: "block" }}
            />
            <div style={{ padding: "12px 14px" }}>
              <p style={{ fontWeight: 700, fontSize: 13, color: "#111827", margin: "0 0 4px" }}>
                SATWIN FOOTBALL – Une nouvelle ère des paris intelligents
              </p>
              <p style={{ fontSize: 12, color: "#6b7280", margin: 0 }}>
                « Ce n'est pas un jeu, ni une plateforme de paris traditionnelle. C'est une expérience inédite. »
              </p>
            </div>
          </div>

          {/* Photo 2 */}
          <div style={{
            background: "white", borderRadius: 14, overflow: "hidden",
            boxShadow: "0 2px 10px rgba(0,0,0,0.07)", marginBottom: 12,
          }}>
            <img
              src="/about/event3.png"
              alt="Présentation SATWIN FOOTBALL"
              style={{ width: "100%", height: 200, objectFit: "cover", display: "block" }}
            />
            <div style={{ padding: "12px 14px" }}>
              <p style={{ fontWeight: 700, fontSize: 13, color: "#111827", margin: "0 0 4px" }}>
                Des opportunités réelles, pas des émotions
              </p>
              <p style={{ fontSize: 12, color: "#6b7280", margin: 0 }}>
                Notre plateforme transforme la passion du football en revenus stables et durables.
              </p>
            </div>
          </div>

          {/* Photo 3 */}
          <div style={{
            background: "white", borderRadius: 14, overflow: "hidden",
            boxShadow: "0 2px 10px rgba(0,0,0,0.07)", marginBottom: 12,
          }}>
            <img
              src="/about/event1.png"
              alt="Événement caritatif SATWIN FOOTBALL"
              style={{ width: "100%", height: 200, objectFit: "cover", display: "block" }}
            />
            <div style={{ padding: "12px 14px" }}>
              <p style={{ fontWeight: 700, fontSize: 13, color: "#111827", margin: "0 0 4px" }}>
                SATWIN FOOTBALL au service des communautés
              </p>
              <p style={{ fontSize: 12, color: "#6b7280", margin: 0 }}>
                « Notre but est d'utiliser le football comme force du bien et de soutenir ceux qui en ont besoin. »
              </p>
            </div>
          </div>
        </div>

        {/* Footer note */}
        <div style={{ margin: "6px 16px 0", padding: "16px", textAlign: "center" }}>
          <p style={{ fontSize: 12, color: "#9ca3af", lineHeight: 1.6 }}>
            Enregistrée en <strong>Estonie en 2020</strong> — Entrée sur le marché africain en <strong>août 2026</strong> — plus de 5 millions de membres dans 50+ pays.
          </p>
        </div>

      </div>
    </div>
  );
}
