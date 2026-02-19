import { createFileRoute } from "@tanstack/react-router";
import { BoardView } from "../components/board/BoardView";

export const Route = createFileRoute("/board")({
  component: BoardPage,
});

function BoardPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <BoardView />
    </div>
  );
}
