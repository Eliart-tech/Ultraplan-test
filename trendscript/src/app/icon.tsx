import { ImageResponse } from "next/og";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

/** Generated favicon — same drawing as <LogoMark /> in the header. */
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 18,
          background: "linear-gradient(135deg, #7b5cff 0%, #6b4eff 45%, #ff5c3a 130%)",
        }}
      >
        <svg width="42" height="42" viewBox="0 0 24 24" fill="none">
          <path
            d="M3.5 16.5 9 11l3.5 3.5L19 8"
            stroke="#ffffff"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="19.5" cy="7.5" r="2.6" fill="#ff5c3a" stroke="#ffffff" strokeWidth="1.4" />
        </svg>
      </div>
    ),
    size,
  );
}
