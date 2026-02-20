import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { BracketView } from "#/components/bracket/BracketView";
import { createBracket } from "#/lib/bracket/useBracketDocument";
import type { BracketId } from "#/lib/bracket/types";

export const Route = createFileRoute("/bracket")({
  component: BracketPage,
});

function BracketPage() {
  const navigate = useNavigate();
  const [currentBracketId, setCurrentBracketId] = useState<BracketId | undefined>(undefined);

  const handleCreateBracket = async (name: string) => {
    try {
      // Get user ID (in real app, from auth)
      const userId = crypto.randomUUID();

      // For demo, create with sample participants
      const participants = [
        "Player 1",
        "Player 2",
        "Player 3",
        "Player 4",
      ];

      const bracketId = await createBracket({
        name,
        participants,
        createdBy: userId,
      });

      setCurrentBracketId(bracketId);
      navigate({ to: "/bracket", search: { id: bracketId } });
    } catch (error) {
      console.error("Failed to create bracket:", error);
    }
  };

  return (
    <div className="[view-transition-name:bracket-view]">
      <BracketView
        bracketId={currentBracketId}
        onCreateBracket={handleCreateBracket}
      />
    </div>
  );
}
