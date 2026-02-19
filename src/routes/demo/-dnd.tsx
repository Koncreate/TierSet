import React from "react";
import { BoardCanvas } from "~/components/BoardCanvas";
import { createId } from "~/lib/ids";
import { generateKeyBetween } from "fractional-indexing";
import "~/styles/dnd.css";

interface Item {
  id: string;
  type: "image" | "text" | "link";
  label: string;
  tierId: string | null;
  order: string;
  imageId?: string;
  url?: string;
}

interface Tier {
  id: string;
  label: string;
  color: string;
  order: string;
}

// Mock Automerge-like interface for demo
interface Doc {
  tiers: Record<string, Tier>;
  items: Record<string, Item>;
  change: (fn: (doc: Doc) => void) => void;
}

const sampleItems: Item[] = [
  {
    id: createId(),
    type: "text",
    label: "Mario",
    tierId: null,
    order: generateKeyBetween(undefined, undefined),
  },
  {
    id: createId(),
    type: "text",
    label: "Luigi",
    tierId: null,
    order: generateKeyBetween(undefined, undefined),
  },
  {
    id: createId(),
    type: "text",
    label: "Peach",
    tierId: null,
    order: generateKeyBetween(undefined, undefined),
  },
  {
    id: createId(),
    type: "text",
    label: "Bowser",
    tierId: null,
    order: generateKeyBetween(undefined, undefined),
  },
  {
    id: createId(),
    type: "text",
    label: "Yoshi",
    tierId: null,
    order: generateKeyBetween(undefined, undefined),
  },
  {
    id: createId(),
    type: "text",
    label: "Wario",
    tierId: null,
    order: generateKeyBetween(undefined, undefined),
  },
];

const sampleTiers: Tier[] = [
  {
    id: createId(),
    label: "S",
    color: "#b8f53a",
    order: generateKeyBetween(undefined, undefined),
  },
  {
    id: createId(),
    label: "A",
    color: "#f53a8a",
    order: generateKeyBetween(undefined, undefined),
  },
  {
    id: createId(),
    label: "B",
    color: "#3af0d4",
    order: generateKeyBetween(undefined, undefined),
  },
  {
    id: createId(),
    label: "C",
    color: "#f0a03a",
    order: generateKeyBetween(undefined, undefined),
  },
];

export default function DndDemo() {
  const [doc, setDoc] = React.useState<Doc>(() => ({
    tiers: Object.fromEntries(sampleTiers.map((t) => [t.id, t])),
    items: Object.fromEntries(sampleItems.map((i) => [i.id, i])),
    change: (fn: (doc: Doc) => void) => {
      setDoc((prevDoc) => {
        const newDoc = { ...prevDoc };
        fn(newDoc);
        return newDoc;
      });
    },
  }));

  return (
    <div>
      <h1>Pragmatic DnD Demo</h1>
      <p>Drag items from the pool into tiers, or reorder items within tiers.</p>

      <BoardCanvas doc={doc} />
    </div>
  );
}
