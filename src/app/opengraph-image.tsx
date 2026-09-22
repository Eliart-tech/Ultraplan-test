import { ImageResponse } from "next/og";
import { site } from "@/lib/site";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = `${site.name} — ${site.tagline}`;

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#f0f6ff",
          padding: 72,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              width: 58,
              height: 58,
              borderRadius: 999,
              background: "#f6d6cf",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#253066",
              fontSize: 34,
              fontWeight: 500,
            }}
          >
            M
          </div>
          <div style={{ color: "#253066", fontSize: 36 }}>{site.name}</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div
            style={{
              color: "#253066",
              fontSize: 68,
              lineHeight: 1.1,
              letterSpacing: -1.5,
              maxWidth: 940,
              display: "flex",
            }}
          >
            Agents IA autonomes au service de votre entreprise
          </div>
          <div style={{ color: "#6b6b6b", fontSize: 28, display: "flex" }}>
            Nous déployons des agents IA et des automatisations qui orchestrent
            vos opérations.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderTop: "1px solid rgba(37,48,102,0.14)",
            paddingTop: 26,
            color: "#6b6b6b",
            fontSize: 25,
          }}
        >
          <span>{site.domain}</span>
          <span style={{ color: "#253066" }}>Réserver un appel</span>
        </div>
      </div>
    ),
    size,
  );
}
