import React, { useState } from "react";
import { X, SignIn } from "@phosphor-icons/react";

interface JoinRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  onJoin: (code: string, password?: string) => Promise<void>;
}

/**
 * Modal for joining an existing P2P room by code
 */
export function JoinRoomModal({ isOpen, onClose, onJoin }: JoinRoomModalProps) {
  const [roomCode, setRoomCode] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsJoining(true);

    try {
      // Format code (ensure TIER- prefix)
      const formattedCode = roomCode.toUpperCase().trim();
      const code = formattedCode.startsWith("TIER-") ? formattedCode : `TIER-${formattedCode}`;

      await onJoin(code, password || undefined);
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to join room");
    } finally {
      setIsJoining(false);
    }
  };

  const handleClose = () => {
    setRoomCode("");
    setPassword("");
    setShowPassword(false);
    setError(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={handleClose}
    >
      <div
        style={{
          background: "white",
          borderRadius: "12px",
          padding: "24px",
          maxWidth: "400px",
          width: "90%",
          boxShadow: "0 4px 24px rgba(0,0,0,0.15)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "20px",
          }}
        >
          <h2
            style={{
              fontSize: "20px",
              fontWeight: 600,
              margin: 0,
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <SignIn size={24} weight="bold" />
            Join Room
          </h2>
          <button
            onClick={handleClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "4px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            aria-label="Close"
          >
            <X size={24} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          {/* Room Code Input */}
          <div style={{ marginBottom: "16px" }}>
            <label
              htmlFor="room-code"
              style={{
                display: "block",
                fontSize: "14px",
                fontWeight: 500,
                marginBottom: "6px",
                color: "#374151",
              }}
            >
              Room Code
            </label>
            <input
              id="room-code"
              type="text"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value)}
              placeholder="TIER-ABC123"
              autoFocus
              style={{
                width: "100%",
                padding: "10px 12px",
                fontSize: "16px",
                border: "2px solid #e5e7eb",
                borderRadius: "6px",
                textTransform: "uppercase",
                letterSpacing: "1px",
                fontFamily: "monospace",
              }}
            />
          </div>

          {/* Password Input (optional) */}
          <div style={{ marginBottom: "20px" }}>
            <label
              htmlFor="room-password"
              style={{
                display: "block",
                fontSize: "14px",
                fontWeight: 500,
                marginBottom: "6px",
                color: "#374151",
              }}
            >
              Password <span style={{ color: "#9ca3af" }}>(if required)</span>
            </label>
            <div style={{ position: "relative" }}>
              <input
                id="room-password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter room password"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  fontSize: "14px",
                  border: "2px solid #e5e7eb",
                  borderRadius: "6px",
                  paddingRight: "40px",
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: "absolute",
                  right: "8px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "4px",
                  color: "#6b7280",
                }}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div
              style={{
                padding: "10px 12px",
                background: "#fee2e2",
                border: "1px solid #fecaca",
                borderRadius: "6px",
                color: "#dc2626",
                fontSize: "14px",
                marginBottom: "16px",
              }}
            >
              {error}
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={!roomCode.trim() || isJoining}
            style={{
              width: "100%",
              padding: "12px 16px",
              fontSize: "16px",
              fontWeight: 600,
              background: roomCode.trim() && !isJoining ? "#2196F3" : "#ccc",
              color: "white",
              border: "none",
              borderRadius: "6px",
              cursor: roomCode.trim() && !isJoining ? "pointer" : "not-allowed",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
            }}
          >
            {isJoining ? (
              <>
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="animate-spin"
                >
                  <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                  <path d="M12 2a10 10 0 0 1 10 10" opacity="0.75" />
                </svg>
                Joining...
              </>
            ) : (
              <>
                <SignIn size={20} weight="bold" />
                Join Room
              </>
            )}
          </button>
        </form>

        {/* Help Text */}
        <p
          style={{
            marginTop: "16px",
            fontSize: "13px",
            color: "#6b7280",
            textAlign: "center",
            margin: "16px 0 0",
          }}
        >
          Enter the room code shared by the host. If the room is password-protected, you'll need to
          enter the password.
        </p>
      </div>
    </div>
  );
}
