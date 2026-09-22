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
          background: "#06060a",
          padding: 72,
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: -220,
            left: 260,
            width: 700,
            height: 700,
            borderRadius: 9999,
            background: "#6438f5",
            opacity: 0.35,
            filter: "blur(130px)",
            display: "flex",
          }}
        />

        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 18,
              background: "linear-gradient(135deg, #9b83ff 0%, #38d3ee 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#07070a",
              fontSize: 40,
              fontWeight: 700,
            }}
          >
            M
          </div>
          <div style={{ color: "#f7f7fb", fontSize: 38, fontWeight: 600 }}>
            {site.name}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
          <div
            style={{
              color: "#ffffff",
              fontSize: 72,
              fontWeight: 700,
              lineHeight: 1.08,
              letterSpacing: -2,
              maxWidth: 940,
              display: "flex",
            }}
          >
            Vos opérations tournent seules. Vous vous concentrez sur la
            croissance.
          </div>
          <div style={{ color: "#9c9cb4", fontSize: 30, display: "flex" }}>
            Agents IA & automatisation sur mesure pour PME
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderTop: "1px solid rgba(255,255,255,0.12)",
            paddingTop: 28,
            color: "#7c7c96",
            fontSize: 26,
          }}
        >
          <span>{site.domain}</span>
          <span style={{ color: "#b7a6ff" }}>Audit offert · Sans engagement</span>
        </div>
      </div>
    ),
    size,
  );
}
