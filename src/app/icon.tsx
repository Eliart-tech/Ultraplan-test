import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

/** Generated favicon, kept in sync with the mark used in the header. */
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
          background: "#f6d6cf",
          borderRadius: 256,
          color: "#253066",
          fontSize: 300,
          fontWeight: 500,
        }}
      >
        M
      </div>
    ),
    size,
  );
}
