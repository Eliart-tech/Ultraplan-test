import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

/** Generated favicon so the mark stays in sync with the one in the header. */
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
          background: "linear-gradient(135deg, #9b83ff 0%, #38d3ee 100%)",
          borderRadius: 128,
          color: "#07070a",
          fontSize: 320,
          fontWeight: 700,
          letterSpacing: -12,
        }}
      >
        M
      </div>
    ),
    size,
  );
}
