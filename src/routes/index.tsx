import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { storage } from "../lib/storage";
import type { BoardSummary } from "../lib/storage/BoardStore";
import { Plus, FolderOpen, FileText, Trash } from "@phosphor-icons/react";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newBoardName, setNewBoardName] = useState("");

  useEffect(() => {
    let mounted = true;

    async function loadBoards() {
      try {
        const boardList = await storage.boards.listBoards();
        if (mounted) {
          setBoards(boardList);
          setIsLoading(false);
        }
      } catch (error) {
        console.error("Failed to load boards:", error);
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    loadBoards();

    return () => {
      mounted = false;
    };
  }, []);

  const handleCreateBoard = async () => {
    if (!newBoardName.trim()) return;

    // Navigate to board creation (in real app, would create via API)
    // For now, just redirect to board route
    window.location.href = "/board";
  };

  const handleDeleteBoard = async (boardId: string) => {
    if (!confirm("Are you sure you want to delete this board?")) return;

    await storage.boards.deleteBoard(boardId);
    setBoards((prev) => prev.filter((b) => b.id !== boardId));
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900">
      {/* Hero Section */}
      <section className="relative py-20 px-6 text-center">
        <div className="relative max-w-5xl mx-auto">
          <h1 className="text-6xl md:text-7xl font-black text-white mb-6 [letter-spacing:-0.08em]">
            <span className="bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
              TIERBOARD
            </span>
          </h1>
          <p className="text-xl md:text-2xl text-gray-300 mb-8 font-light max-w-3xl mx-auto">
            Create and share collaborative tier lists with real-time P2P sync. No server required.
          </p>

          {/* Create Board Form */}
          <div className="max-w-xl mx-auto mb-12">
            <div className="flex gap-3">
              <input
                type="text"
                value={newBoardName}
                onChange={(e) => setNewBoardName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleCreateBoard();
                  }
                }}
                placeholder="Enter tier list name..."
                className="flex-1 px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
              <Link
                to="/board"
                className="px-6 py-3 bg-cyan-500 hover:bg-cyan-600 text-white font-semibold rounded-lg transition-colors shadow-lg shadow-cyan-500/50 flex items-center gap-2"
              >
                <Plus size={20} weight="bold" />
                Create
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Boards List */}
      <section className="py-12 px-6 max-w-5xl mx-auto">
        <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
          <FolderOpen size={28} weight="fill" className="text-cyan-400" />
          Your Tier Lists
        </h2>

        {isLoading ? (
          <div className="text-center py-12 text-gray-400">Loading...</div>
        ) : boards.length === 0 ? (
          <div className="text-center py-12">
            <FileText size={64} weight="light" className="mx-auto mb-4 text-gray-500" />
            <p className="text-gray-400 text-lg">No tier lists yet. Create your first one above!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {boards.map((board) => (
              <div
                key={board.id}
                className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6 hover:border-cyan-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-cyan-500/10"
              >
                <div className="flex items-start justify-between mb-4">
                  <h3 className="text-xl font-semibold text-white truncate flex-1">{board.name}</h3>
                  <button
                    onClick={() => handleDeleteBoard(board.id)}
                    className="ml-2 p-2 text-gray-400 hover:text-red-400 transition-colors"
                    title="Delete board"
                  >
                    <Trash size={18} />
                  </button>
                </div>

                {board.description && (
                  <p className="text-gray-400 text-sm mb-4 line-clamp-2">{board.description}</p>
                )}

                <div className="flex items-center justify-between text-sm text-gray-500 mb-4">
                  <span>{board.itemCount} items</span>
                  <span>{board.tierCount} tiers</span>
                </div>

                <Link
                  to="/board"
                  search={{ id: board.id }}
                  className="block w-full py-2 px-4 bg-slate-700 hover:bg-slate-600 text-cyan-400 text-center rounded-lg transition-colors font-medium"
                >
                  Open
                </Link>

                <div className="mt-3 text-xs text-gray-500">
                  Updated {new Date(board.updatedAt).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Features */}
      <section className="py-16 px-6 mt-12 border-t border-slate-700">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-bold text-white mb-8 text-center">Features</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 bg-cyan-500/20 rounded-full flex items-center justify-center">
                <Waves size={32} className="text-cyan-400" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Real-time P2P Sync</h3>
              <p className="text-gray-400">
                Collaborate with friends in real-time using WebRTC. No server needed.
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 bg-blue-500/20 rounded-full flex items-center justify-center">
                <Shield size={32} className="text-blue-400" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Local-First Storage</h3>
              <p className="text-gray-400">
                Your data stays on your device in IndexedDB. Full offline support.
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 bg-purple-500/20 rounded-full flex items-center justify-center">
                <Sparkles size={32} className="text-purple-400" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">CRDT Powered</h3>
              <p className="text-gray-400">
                Conflict-free merges with Automerge. Never lose your changes.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

// Icons for features section
function Waves({ size, className }: { size: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={className}
    >
      <path d="M2 12c.6 0 1.3.4 2 1s1.4 1 2 1 1.3-.4 2-1 1.4-1 2-1 1.3.4 2 1 1.4 1 2 1 1.3-.4 2-1 1.4-1 2-1 1.3.4 2 1 1.4 1 2 1" />
      <path d="M2 17c.6 0 1.3.4 2 1s1.4 1 2 1 1.3-.4 2-1 1.4-1 2-1 1.3.4 2 1 1.4 1 2 1 1.3-.4 2-1 1.4-1 2-1 1.3.4 2 1 1.4 1 2 1" />
      <path d="M2 7c.6 0 1.3.4 2 1s1.4 1 2 1 1.3-.4 2-1 1.4-1 2-1 1.3.4 2 1 1.4 1 2 1 1.3-.4 2-1 1.4-1 2-1 1.3.4 2 1 1.4 1 2 1" />
    </svg>
  );
}

function Shield({ size, className }: { size: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={className}
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function Sparkles({ size, className }: { size: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={className}
    >
      <path d="M12 3l1.912 5.813a2 2 0 001.272 1.272L21 12l-5.813 1.912a2 2 0 00-1.272 1.272L12 21l-1.912-5.813a2 2 0 00-1.272-1.272L3 12l5.813-1.912a2 2 0 001.272-1.272L12 3z" />
      <path d="M5 3v4" />
      <path d="M9 5H5" />
      <path d="M19 17v4" />
      <path d="M15 19h4" />
    </svg>
  );
}
