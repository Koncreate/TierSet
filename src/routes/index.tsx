import { createFileRoute, Link } from "@tanstack/react-router";
import { useButton } from "@react-aria/button";
import { useFocusRing } from "@react-aria/focus";
import { mergeProps } from "@react-aria/utils";
import { useState } from "react";
import { SquaresFour, Trophy, ArrowRight, Star, Waves, ShieldCheck } from "@phosphor-icons/react";

export const Route = createFileRoute("/")({
  component: SelectionMenuPage,
});

function SelectionMenuPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 [view-transition-name:app-root]">
      {/* Hero Section */}
      <section className="relative py-20 px-6 text-center">
        <div className="relative max-w-5xl mx-auto">
          <h1 className="text-6xl md:text-7xl font-black text-white mb-6 [letter-spacing:-0.08em] [view-transition-name:title]">
            <span className="bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
              TIERBOARD
            </span>
          </h1>
          <p className="text-xl md:text-2xl text-gray-300 mb-12 font-light max-w-3xl mx-auto [view-transition-name:subtitle]">
            Create collaborative tier lists and tournament brackets with real-time P2P sync.
            No server required.
          </p>

          {/* Selection Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            <ModeCard
              title="Tier List"
              description="Rank and categorize items with collaborative real-time sync"
              icon={SquaresFour}
              href="/board"
              gradient="from-cyan-400 to-blue-400"
              shadowColor="cyan"
            />
            <ModeCard
              title="Tournament Bracket"
              description="Create single-elimination brackets with live updates"
              icon={Trophy}
              href="/bracket"
              gradient="from-amber-400 to-orange-400"
              shadowColor="amber"
            />
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-16 px-6 mt-12 border-t border-slate-700">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-bold text-white mb-8 text-center">Features</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <FeatureCard
              icon={Waves}
              iconColor="text-cyan-400"
              bgColor="bg-cyan-500/20"
              title="Real-time P2P Sync"
              description="Collaborate with friends in real-time using WebRTC. No server needed."
            />
            <FeatureCard
              icon={ShieldCheck}
              iconColor="text-blue-400"
              bgColor="bg-blue-500/20"
              title="Local-First Storage"
              description="Your data stays on your device in IndexedDB. Full offline support."
            />
            <FeatureCard
              icon={Star}
              iconColor="text-purple-400"
              bgColor="bg-purple-500/20"
              title="CRDT Powered"
              description="Conflict-free merges with Automerge. Never lose your changes."
            />
          </div>
        </div>
      </section>
    </div>
  );
}

interface ModeCardProps {
  title: string;
  description: string;
  icon: React.ComponentType<{ size: number; className?: string; weight?: string }>;
  href: string;
  gradient: string;
  shadowColor: string;
}

function ModeCard({ title, description, icon: Icon, href, gradient, shadowColor }: ModeCardProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <Link
      to={href as any}
      className="group block"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        className={`
          relative p-8 rounded-2xl border-2 border-slate-700
          bg-slate-800/50 backdrop-blur-sm
          transition-all duration-300 ease-out
          hover:border-transparent hover:shadow-2xl
          ${shadowColor === "cyan" ? "hover:shadow-cyan-500/20" : "hover:shadow-orange-500/20"}
        `}
      >
        {/* Gradient border on hover */}
        <div
          className={`
            absolute inset-0 rounded-2xl p-[2px]
            bg-gradient-to-r ${gradient}
            opacity-0 group-hover:opacity-100
            transition-opacity duration-300
            -z-10
          `}
        />

        {/* Icon */}
        <div
          className={`
            w-20 h-20 rounded-xl mb-6
            bg-gradient-to-br ${gradient}
            flex items-center justify-center
            transform group-hover:scale-110 group-hover:rotate-3
            transition-all duration-300
          `}
        >
          <Icon size={40} weight="fill" className="text-white" />
        </div>

        {/* Title */}
        <h3 className="text-2xl font-bold text-white mb-3 group-hover:translate-x-2 transition-transform duration-300">
          {title}
        </h3>

        {/* Description */}
        <p className="text-gray-400 text-lg mb-6">{description}</p>

        {/* CTA */}
        <div className="flex items-center gap-3 text-gray-300 group-hover:text-white transition-colors duration-300">
          <span className="font-semibold">Get Started</span>
          <ArrowRight
            size={20}
            weight="bold"
            className={`
              transform transition-transform duration-300
              ${isHovered ? "translate-x-2" : ""}
            `}
          />
        </div>
      </div>
    </Link>
  );
}

interface FeatureCardProps {
  icon: React.ComponentType<{ size: number; className?: string }>;
  iconColor: string;
  bgColor: string;
  title: string;
  description: string;
}

function FeatureCard({ icon: Icon, iconColor, bgColor, title, description }: FeatureCardProps) {
  return (
    <div className="text-center">
      <div className={`w-16 h-16 mx-auto mb-4 ${bgColor} rounded-full flex items-center justify-center`}>
        <Icon size={32} className={iconColor} />
      </div>
      <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
      <p className="text-gray-400">{description}</p>
    </div>
  );
}
