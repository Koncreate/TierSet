import { createFileRoute } from "@tanstack/react-router";
import { ClientOnly } from "@tanstack/react-router";
import { BoardView } from "../components/board/BoardView";
import type { BoardId } from "../lib/documents";
import { useState, useEffect } from "react";
import { createId } from "../lib/ids";

export const Route = createFileRoute("/board")({
  component: BoardPage,
});

function BoardPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <ClientOnly fallback={<div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "64px", minHeight: "400px" }}><div>Loading...</div></div>}>
        <BoardViewWithAutoCreate />
      </ClientOnly>
    </div>
  );
}

function BoardViewWithAutoCreate() {
  const [boardId, setBoardId] = useState<BoardId | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Generate a new board ID on mount
    // BoardView will handle document creation via useBoardDocument()
    const newBoardId = createId();
    setBoardId(newBoardId);
  }, []);

  if (error) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "64px",
          minHeight: "400px",
        }}
      >
        <div style={{ color: "red" }}>Error: {error}</div>
      </div>
    );
  }

  if (!boardId) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "64px",
          minHeight: "400px",
        }}
      >
        <div>Creating tier list...</div>
      </div>
    );
  }

  return <BoardView boardId={boardId} />;
}
