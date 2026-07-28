import QRCode from "qrcode";

// A join code as a QR, for the realistic delivery mechanism: a teacher with a
// projector and a room of twelve-year-olds.
//
// This is a shortcut to ENROLMENT, not a way to sign in. QR-as-login is what
// products for five-year-olds do, and it would throw away the thing SSO gives
// us — an identity vouched for by the school's own directory. A photographed
// login QR is a permanent credential; a photographed join code is worth no
// more than the same code written on the whiteboard beside it, and the
// teacher can rotate it.
//
// Rendered as <rect> elements built from the matrix rather than the library's
// SVG string, so nothing needs dangerouslySetInnerHTML.
export default async function JoinQr({ url, size = 132 }: { url: string; size?: number }) {
  let matrix: { size: number; data: Uint8Array };
  try {
    matrix = QRCode.create(url, { errorCorrectionLevel: "M" }).modules;
  } catch {
    // A code that cannot be encoded is not worth failing a page over — the
    // digits are printed next to it regardless.
    return null;
  }

  const quiet = 2;
  const span = matrix.size + quiet * 2;
  const rects: { x: number; y: number }[] = [];
  for (let y = 0; y < matrix.size; y++) {
    for (let x = 0; x < matrix.size; x++) {
      if (matrix.data[y * matrix.size + x]) rects.push({ x: x + quiet, y: y + quiet });
    }
  }

  return (
    <svg
      viewBox={`0 0 ${span} ${span}`}
      width={size}
      height={size}
      role="img"
      aria-label="QR code to join this class"
      className="rounded-lg bg-white p-1"
      shapeRendering="crispEdges"
    >
      {rects.map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={1} height={1} fill="#000" />
      ))}
    </svg>
  );
}
