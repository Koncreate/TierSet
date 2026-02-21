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
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={handleClose}
    >
      <div
        className="bg-white rounded-xl p-6 max-w-[400px] w-[90%] shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-xl font-semibold m-0 flex items-center gap-2">
            <SignIn size={24} weight="bold" />
            Join Room
          </h2>
          <button
            onClick={handleClose}
            className="bg-transparent border-none cursor-pointer p-1 flex items-center justify-center"
            aria-label="Close"
          >
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label
              htmlFor="room-code"
              className="block text-sm font-medium mb-1.5 text-gray-700"
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
              className="w-full py-2.5 px-3 text-base border-2 border-gray-200 rounded-md uppercase tracking-wide font-mono"
            />
          </div>

          <div className="mb-5">
            <label
              htmlFor="room-password"
              className="block text-sm font-medium mb-1.5 text-gray-700"
            >
              Password <span className="text-gray-400">(if required)</span>
            </label>
            <div className="relative">
              <input
                id="room-password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter room password"
                className="w-full py-2.5 px-3 text-sm border-2 border-gray-200 rounded-md pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2 top-1/2 -translate-y-1/2 bg-transparent border-none cursor-pointer p-1 text-gray-500"
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

          {error && (
            <div className="py-2.5 px-3 bg-red-100 border border-red-200 rounded-md text-red-600 text-sm mb-4">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={!roomCode.trim() || isJoining}
            className={`w-full py-3 px-4 text-base font-semibold text-white border-none rounded-md flex items-center justify-center gap-2 ${
              roomCode.trim() && !isJoining
                ? "bg-[#2196F3] cursor-pointer"
                : "bg-gray-300 cursor-not-allowed"
            }`}
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

        <p className="mt-4 text-[13px] text-gray-500 text-center">
          Enter the room code shared by the host. If the room is password-protected, you'll need to
          enter the password.
        </p>
      </div>
    </div>
  );
}
