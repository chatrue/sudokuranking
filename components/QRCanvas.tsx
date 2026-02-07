"use client";

import { useEffect, useRef } from "react";
import QRCode from "qrcode";

type Props = {
  value: string;
  size?: number;
};

export function QRCanvas({ value, size = 132 }: Props) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !value) return;

    QRCode.toCanvas(canvas, value, {
      width: size,
      margin: 1,
      errorCorrectionLevel: "M",
    }).catch(() => {});
  }, [value, size]);

  return <canvas ref={ref} width={size} height={size} style={{ display: "block" }} />;
}
