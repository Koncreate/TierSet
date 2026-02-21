import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { Trophy, Users, TreeStructure, ListNumbers, ArrowRight } from "@phosphor-icons/react";
import { BracketView } from "../components/bracket/BracketView";
import { createBracketDocument } from "../lib/bracket/types";
import * as m from "../paraglide/messages";

export const Route = createFileRoute("/bracket")({
  component: BracketPage,
});

type TournamentFormat = "single" | "double" | "round-robin" | "swiss";

interface TournamentType {
  id: TournamentFormat;
  name: () => string;
  description: () => string;
  icon: React.ReactNode;
  minParticipants: number;
  maxParticipants: number;
}

const tournamentTypes: TournamentType[] = [
  {
    id: "single",
    name: () => m.bracket_singleElimination(),
    description: () => m.bracket_singleEliminationDesc(),
    icon: <Trophy size={32} weight="duotone" />,
    minParticipants: 2,
    maxParticipants: 64,
  },
  {
    id: "double",
    name: () => m.bracket_doubleElimination(),
    description: () => m.bracket_doubleEliminationDesc(),
    icon: <TreeStructure size={32} weight="duotone" />,
    minParticipants: 2,
    maxParticipants: 64,
  },
  {
    id: "round-robin",
    name: () => m.bracket_roundRobin(),
    description: () => m.bracket_roundRobinDesc(),
    icon: <Users size={32} weight="duotone" />,
    minParticipants: 3,
    maxParticipants: 16,
  },
  {
    id: "swiss",
    name: () => m.bracket_swissSystem(),
    description: () => m.bracket_swissSystemDesc(),
    icon: <ListNumbers size={32} weight="duotone" />,
    minParticipants: 4,
    maxParticipants: 32,
  },
];

function BracketPage() {
  const [selectedFormat, setSelectedFormat] = useState<TournamentFormat | null>(null);
  const [bracketName, setBracketName] = useState("");
  const [participantCount, setParticipantCount] = useState(8);

  // Create the bracket based on selections
  const bracket = useMemo(() => {
    if (selectedFormat !== "single" || !bracketName.trim()) return null;

    const participants = Array.from({ length: participantCount }, (_, i) => `Player ${i + 1}`);
    return createBracketDocument({
      name: bracketName,
      participants,
      createdBy: "demo-user",
    });
  }, [selectedFormat, bracketName, participantCount]);

  // If bracket is created, show it
  if (bracket) {
    return <BracketView bracket={bracket} />;
  }

  // If format selected but no bracket yet, show config
  if (selectedFormat) {
    const format = tournamentTypes.find((t) => t.id === selectedFormat)!;

    // For single elimination, show bracket directly when name has value
    const showBracket = selectedFormat === "single" && bracketName.trim();

    if (showBracket) {
      return <BracketView bracket={bracket!} />;
    }

    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 p-6">
        <div className="max-w-2xl mx-auto">
          <button
            onClick={() => setSelectedFormat(null)}
            className="text-gray-400 hover:text-white mb-6 flex items-center gap-2"
          >
            <ArrowRight size={16} className="rotate-180" />
            {m.bracket_back()}
          </button>

          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
            <div className="flex items-center gap-4 mb-6">
              <div className="p-3 bg-slate-700 rounded-lg text-amber-400">
                {format.icon}
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white">{format.name()}</h2>
                <p className="text-gray-400">{format.description()}</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  {m.bracket_tournamentName()}
                </label>
                <input
                  type="text"
                  value={bracketName}
                  onChange={(e) => setBracketName(e.target.value)}
                  placeholder={m.bracket_tournamentNamePlaceholder()}
                  className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  {m.bracket_participantCount()}
                </label>
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min={format.minParticipants}
                    max={format.maxParticipants}
                    value={participantCount}
                    onChange={(e) => setParticipantCount(Number(e.target.value))}
                    className="flex-1 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-amber-500"
                  />
                  <span className="text-white font-semibold w-12 text-center">{participantCount}</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {format.minParticipants} - {format.maxParticipants} participants
                </p>
              </div>

              <div className="bg-slate-700/50 rounded-lg p-4 mt-6">
                <h4 className="text-sm font-medium text-gray-300 mb-2">{m.bracket_participantsPreview()}</h4>
                <div className="grid grid-cols-4 gap-2">
                  {Array.from({ length: participantCount }, (_, i) => (
                    <div key={i} className="bg-slate-700 rounded px-3 py-2 text-sm text-gray-300 text-center">
                      P{i + 1}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {selectedFormat !== "single" && (
            <div className="mt-4 p-4 bg-slate-700/50 border border-slate-600 rounded-lg">
              <p className="text-sm text-gray-400">
                {m.bracket_comingSoon()}
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Show format selection screen
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold text-white mb-2">{m.bracket_createTitle()}</h1>
        <p className="text-gray-400 mb-8">{m.bracket_chooseFormat()}</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {tournamentTypes.map((type) => (
            <button
              key={type.id}
              onClick={() => setSelectedFormat(type.id)}
              className="group relative bg-slate-800 border border-slate-700 hover:border-amber-500/50 rounded-xl p-6 text-left transition-all duration-200 hover:shadow-lg hover:shadow-amber-500/10"
            >
              <div className="flex items-start gap-4">
                <div className="p-3 bg-slate-700 rounded-lg text-amber-400 group-hover:bg-amber-500/20 transition-colors">
                  {type.icon}
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-white mb-1">{type.name()}</h3>
                  <p className="text-sm text-gray-400">{type.description()}</p>
                  <p className="text-xs text-gray-500 mt-2">
                    {type.minParticipants}-{type.maxParticipants} participants
                  </p>
                </div>
                <ArrowRight size={20} className="text-gray-500 group-hover:text-amber-400 transition-colors" />
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
