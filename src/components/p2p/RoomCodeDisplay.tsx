import { useState, useEffect, useRef } from "react";
import { Copy, Check, QrCode, X } from "@phosphor-icons/react";
import QRCode from "qrcode";

interface RoomCodeProps {
  code: string;
  roomType?: "tierlist" | "bracket";
  onCopy?: () => void;
}

export function RoomCodeDisplay({ code, roomType = "tierlist", onCopy }: RoomCodeProps) {
  const [copied, setCopied] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const modalRef = useRef<HTMLDivElement>(null);

  // Generate QR code when modal opens
  useEffect(() => {
    if (showQR && !qrDataUrl) {
      const roomUrl = `${window.location.origin}${roomType === "bracket" ? "/bracket" : "/board"}?room=${code}`;
      QRCode.toDataURL(roomUrl, {
        width: 256,
        margin: 2,
        color: {
          dark: "#1e293b",
          light: "#ffffff",
        },
      })
        .then((url) => setQrDataUrl(url))
        .catch((err) => console.error("Failed to generate QR code:", err));
    }
  }, [showQR, qrDataUrl, code, roomType]);

  // Close modal on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowQR(false);
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, []);

  // Close modal on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        setShowQR(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      onCopy?.();
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy room code:", error);
    }
  };

  return (
    <>
      <div
        className="flex items-center gap-3 px-4 py-3 bg-slate-700/50 rounded-lg border border-slate-600"
      >
        <div className="flex-1 text-center">
          <div className="text-xs text-gray-400 mb-1">Room Code</div>
          <div className="text-xl font-bold font-mono tracking-wider text-white">
            {code}
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setShowQR(true)}
            className="flex items-center justify-center w-10 h-10 border-none rounded-lg bg-slate-600 hover:bg-slate-500 text-white cursor-pointer transition-all"
            title="Show QR code"
          >
            <QrCode size={20} />
          </button>

          <button
            onClick={handleCopy}
            className="flex items-center justify-center w-10 h-10 border-none rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white cursor-pointer transition-all"
            title="Copy room code"
          >
            {copied ? <Check size={20} weight="fill" /> : <Copy size={20} />}
          </button>
        </div>
      </div>

      {/* QR Code Modal */}
      {showQR && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="qr-modal-title"
        >
          <div
            ref={modalRef}
            className="bg-slate-800 border border-slate-700 rounded-xl p-6 max-w-sm w-full shadow-2xl"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 id="qr-modal-title" className="text-lg font-semibold text-white">
                Scan to Join
              </h3>
              <button
                onClick={() => setShowQR(false)}
                className="p-1 text-gray-400 hover:text-white transition-colors"
                aria-label="Close QR code modal"
              >
                <X size={20} />
              </button>
            </div>

            {/* QR Code */}
            <div className="flex justify-center mb-4">
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt="Room QR Code"
                  className="w-64 h-64 rounded-lg border-4 border-white shadow-lg"
                />
              ) : (
                <div className="w-64 h-64 flex items-center justify-center bg-slate-700 rounded-lg">
                  <div className="text-gray-400">Generating QR...</div>
                </div>
              )}
            </div>

            {/* Room Info */}
            <div className="text-center mb-4">
              <div className="text-sm text-gray-400 mb-1">Room Code</div>
              <div className="text-2xl font-bold font-mono text-white">{code}</div>
            </div>

            {/* Instructions */}
            <div className="bg-slate-700/50 rounded-lg p-3 text-sm text-gray-400">
              <p className="text-center">
                📱 Scan this QR code with your phone camera to join this {roomType} room
              </p>
            </div>

            {/* Share URL */}
            <div className="mt-4">
              <button
                onClick={async () => {
                  const roomUrl = `${window.location.origin}${roomType === "bracket" ? "/bracket" : "/board"}?room=${code}`;
                  await navigator.clipboard.writeText(roomUrl);
                }}
                className="w-full px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors text-sm"
              >
                📋 Copy Join URL
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
