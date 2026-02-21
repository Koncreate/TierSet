# TierBoard - Authentication, Billing & WebSocket Integration Plan

## Overview

This document outlines the implementation plan for adding:
1. **Clerk Authentication** - Google OAuth sign-in
2. **Billing Integration** - Subscription tiers via Clerk + Stripe
3. **PartyKit WebSocket** - Large room support (50 users max)
4. **User Menu** - Avatar dropdown with billing, theme, language, sign out
5. **Feature Gating** - Based on subscription tier

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         TIERBOARD ARCHITECTURE                           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                        FRONTEND (Client)                          │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │   │
│  │  │ Clerk Auth  │  │ PartySocket │  │ Automerge + IndexedDB   │  │   │
│  │  │ (Google Oauth│  │ (WebSocket)│  │ (Local-first storage)  │  │   │
│  │  └─────────────┘  └─────────────┘  └─────────────────────────┘  │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                    │                                    │
│                                    ▼                                    │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                         INFRASTRUCTURE                           │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │   │
│  │  │ Clerk       │  │ PartyKit    │  │ Cloudflare Workers      │  │   │
│  │  │ (Auth+Billing)│  │ (WebSocket │  │ (Signaling + P2P)      │  │   │
│  │  │             │  │  Relay)     │  │                         │  │   │
│  │  └─────────────┘  └─────────────┘  └─────────────────────────┘  │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Tier Comparison

| Feature                    | Free Tier      | Pro Tier (Paid)              |
| -------------------------- | -------------- | ---------------------------- |
| **Room Size**              | 2-10 peers (P2P) | Up to 50 (PartyKit WebSocket) |
| **Board Storage**          | Local only     | Cloud sync                   |
| **Private Boards**         | ❌             | ✅                           |
| **Image Uploads**          | 10 max         | Unlimited                    |
| **Stream Integration**     | ❌             | ✅ (Twitch/Kick/YouTube)     |
| **Real-time Cursors**      | ❌             | ✅                           |
| **Export/Import**          | JSON only      | ZIP with images              |
| **Custom Themes**          | 3 presets      | Unlimited                    |
| **Room Code**              | Full (40+ chars) | Shortened (6 chars)        |

### Room Code Shortening

**Free Tier:** Room codes include the full Automerge document URL embedded:
```
Room Code: ABC123-YXV0b21lcmdlOjRaVXlKcHhvOWlRaDhrQ0RXZllhUzVmREF1dw==
           ↑____↑ ↑___________________________________________________________↑
           Prefix  Base64-encoded Automerge document URL
```

**Pro Tier:** Room codes are shortened using Cloudflare URL Shortener:
```
Room Code: ABC123
```

The shortened link redirects to the full room code (with embedded document URL) when accessed.

#### Implementation

1. **Free users** get room codes with embedded document URL (no server lookup needed)
2. **Pro users** get short codes that redirect via Cloudflare Short Links
3. When joining, the client:
   - Checks if code contains `-` (embedded URL)
   - If yes: decode and use directly
   - If no: fetch from Cloudflare Short Links API to get full code

```ts
// src/lib/p2p/room-code.ts
export function encodeRoomCode(code: string, documentUrl: string): string {
  const encoded = btoa(documentUrl);
  return `${code}-${encoded}`;
}

export function decodeRoomCode(fullCode: string): string | null {
  try {
    const parts = fullCode.split('-');
    if (parts.length < 2) return null;
    return atob(parts.slice(1).join('-'));
  } catch {
    return null;
  }
}
```

#### Cloudflare Short Links Integration (Pro Feature)

```ts
// src/lib/p2p/short-links.ts
export async function createShortLink(fullCode: string): Promise<string> {
  const response = await fetch('https://short.links/api/v1/links', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      destination: `/room/${fullCode}`,
      shortLink: `/room/${shortCode}`,
    }),
  });
  return shortCode;
}

export async function resolveShortLink(shortCode: string): Promise<string> {
  const response = await fetch(`https://short.links/api/v1/links/${shortCode}`);
  const data = await response.json();
  return data.destination; // Returns full room code
}
```

---

## Step 1: Clerk Authentication Setup

### 1.1 Install Clerk SDK

```bash
bun add @clerk/clerk-react
```

### 1.2 Environment Variables

Add to `.env`:

```env
# Clerk (get from https://dashboard.clerk.com/)
VITE_CLERK_PUBLISHABLE_KEY=pk_test_xxxxx
CLERK_SECRET_KEY=sk_test_xxxxx

# PartyKit (get from https://partykit.io/)
VITE_PARTYKIT_HOST=localhost:1999  # dev
# VITE_PARTYKIT_HOST=your-app.partykit.dev  # prod
```

### 1.3 Clerk Dashboard Configuration

1. **Create Application**:
   - Name: "TierBoard"
   - Sign-in options: Google only (disable email/password)

2. **Configure Google OAuth**:
   - Go to User & Authentication → Social Connections
   - Enable Google
   - Enter Google Cloud OAuth credentials

3. **Enable Billing**:
   - Go to Billing Settings → Enable Billing
   - Connect Stripe (or use Clerk's test gateway)

4. **Create Subscription Plans**:
   - **Free**: Basic features, P2P rooms
   - **Pro**: $9.99/month - Large rooms, private boards, stream integration

### 1.4 Update __root.tsx

```tsx
// src/routes/__root.tsx
import { ClerkProvider } from "@clerk/clerk-react";

export const Route = createRootRouteWithContext<MyRouterContext>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "TierBoard" },
      // Clerk needs this for auth
      { name: " Clerk Publishable Key", content: import.meta.env.VITE_CLERK_PUBLISHABLE_KEY },
    ],
  }),
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <ClerkProvider publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}>
          <TanStackQueryProvider>
            <AutomergeRepoProvider>
              <Header />
              {children}
              {/* Devtools... */}
            </AutomergeRepoProvider>
          </TanStackQueryProvider>
        </ClerkProvider>
        <Scripts />
      </body>
    </html>
  );
}
```

---

## Step 2: User Menu Component

### 2.1 Create UserMenu Component

```tsx
// src/components/user-menu/UserMenu.tsx
import { useAuth, UserButton, useUser } from "@clerk/clerk-react";
import { useState, useRef, useEffect } from "react";

interface UserMenuProps {
  onBillingClick: () => void;
  onThemeClick: () => void;
  onLanguageClick: () => void;
}

export function UserMenu({ onBillingClick, onThemeClick, onLanguageClick }: UserMenuProps) {
  const { isSignedIn, signOut } = useAuth();
  const { user } = useUser();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!isSignedIn) {
    return null;
  }

  return (
    <div className="relative" ref={menuRef}>
      <UserButton 
        afterSignOutUrl="/"
        appearance={{
          elements: {
            avatarBox: "w-9 h-9 rounded-full",
          },
        }}
      />
      
      {isOpen && (
        <div className="absolute right-0 mt-2 w-56 bg-[var(--bg-primary)] rounded-lg shadow-lg border border-[var(--border-color)] py-1 z-50">
          <div className="px-4 py-2 border-b border-[var(--border-color)]">
            <p className="text-sm font-medium text-[var(--text-primary)]">
              {user?.fullName || user?.username}
            </p>
            <p className="text-xs text-[var(--text-secondary)]">
              {user?.primaryEmailAddress?.emailAddress}
            </p>
          </div>

          <button
            onClick={() => { onBillingClick(); setIsOpen(false); }}
            className="w-full px-4 py-2 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--bg-hover)] flex items-center gap-2"
          >
            <CreditCardIcon className="w-4 h-4" />
            Billing & Subscription
          </button>

          <button
            onClick={() => { onThemeClick(); setIsOpen(false); }}
            className="w-full px-4 py-2 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--bg-hover)] flex items-center gap-2"
          >
            <PaletteIcon className="w-4 h-4" />
            Theme
          </button>

          <button
            onClick={() => { onLanguageClick(); setIsOpen(false); }}
            className="w-full px-4 py-2 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--bg-hover)] flex items-center gap-2"
          >
            <GlobeIcon className="w-4 h-4" />
            Language
          </button>

          <div className="border-t border-[var(--border-color)] my-1" />

          <button
            onClick={() => signOut()}
            className="w-full px-4 py-2 text-left text-sm text-red-500 hover:bg-[var(--bg-hover)] flex items-center gap-2"
          >
            <SignOutIcon className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      )}
    </div>
  );
}
```

### 2.2 Create Header Integration

```tsx
// src/components/Header.tsx (existing file - add imports and state)

import { useAuth, SignIn, SignedIn, SignedOut } from "@clerk/clerk-react";
import { UserMenu } from "./user-menu/UserMenu";
import { useState } from "react";

// Add state for modals
const [showSignIn, setShowSignIn] = useState(false);
const [showBilling, setShowBilling] = useState(false);
const [showTheme, setShowTheme] = useState(false);
const [showLanguage, setShowLanguage] = useState(false);

// In the header JSX:
<SignedOut>
  <button 
    onClick={() => setShowSignIn(true)}
    className="px-4 py-2 bg-[var(--accent)] text-white rounded-lg"
  >
    Sign In
  </button>
</SignedOut>

<SignedIn>
  <UserMenu 
    onBillingClick={() => setShowBilling(true)}
    onThemeClick={() => setShowTheme(true)}
    onLanguageClick={() => setShowLanguage(true)}
  />
</SignedIn>

{/* Modals */}
{showSignIn && (
  <SignInModal onClose={() => setShowSignIn(false)} />
)}

{showBilling && (
  <BillingModal onClose={() => setShowBilling(false)} />
)}

{showTheme && (
  <ThemeModal onClose={() => setShowTheme(false)} />
)}

{showLanguage && (
  <LanguageModal onClose={() => setShowLanguage(false)} />
)}
```

---

## Step 3: Sign-In Modal

### 3.1 Create SignInModal Component

```tsx
// src/components/modals/SignInModal.tsx
import { SignIn } from "@clerk/clerk-react";

interface SignInModalProps {
  onClose: () => void;
}

export function SignInModal({ onClose }: SignInModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-[var(--bg-primary)] rounded-xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        >
          <XIcon className="w-5 h-5" />
        </button>
        
        <div className="p-6">
          <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-2">
            Welcome to TierBoard
          </h2>
          <p className="text-[var(--text-secondary)] mb-6">
            Sign in to save your boards and collaborate with others
          </p>
          
          <SignIn 
            appearance={{
              elements: {
                rootBox: "w-full",
                card: "shadow-none border border-[var(--border-color)]",
                formButtonPrimary: "bg-[var(--accent)] hover:bg-[var(--accent-hover)]",
                dividerLine: "bg-[var(--border-color)]",
                dividerText: "text-[var(--text-secondary)]",
                footerActionLink: "text-[var(--accent)] hover:text-[var(--accent-hover)]",
              },
            }}
            routing="virtual"
            signUpUrl="/sign-up"
            redirectUrl="/"
          />
        </div>
      </div>
    </div>
  );
}
```

---

## Step 4: Billing Modal

### 4.1 Create BillingModal Component

```tsx
// src/components/modals/BillingModal.tsx
import { useAuth, PricingTable, Protect } from "@clerk/clerk-react";

interface BillingModalProps {
  onClose: () => void;
}

export function BillingModal({ onClose }: BillingModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      <div className="relative bg-[var(--bg-primary)] rounded-xl shadow-2xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-[var(--bg-primary)] p-4 border-b border-[var(--border-color)] flex justify-between items-center">
          <h2 className="text-xl font-bold text-[var(--text-primary)]">
            Subscription Plans
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-6">
          <PricingTable />
        </div>
      </div>
    </div>
  );
}
```

### 4.2 Check Subscription in Components

```tsx
import { useAuth, has } from "@clerk/clerk-react";

function CreateBoardButton() {
  const { has } = useAuth();
  
  const canCreatePrivateBoard = has({ plan: "pro" });
  const canUseLargeRoom = has({ feature: "large_rooms" });
  
  return (
    <>
      <button>Create Board</button>
      
      {!canCreatePrivateBoard && (
        <p>Upgrade to Pro for private boards</p>
      )}
    </>
  );
}
```

---

## Step 5: Theme System

### 5.1 Theme Definitions

```css
/* src/styles/themes.css */
:root {
  /* Default Dark Theme */
  --bg-primary: #1a1a2e;
  --bg-secondary: #16213e;
  --bg-hover: #0f3460;
  --text-primary: #eaeaea;
  --text-secondary: #a0a0a0;
  --accent: #e94560;
  --accent-hover: #ff6b6b;
  --border-color: #2a2a4a;
}

[data-theme="light"] {
  --bg-primary: #ffffff;
  --bg-secondary: #f5f5f5;
  --bg-hover: #e8e8e8;
  --text-primary: #1a1a1a;
  --text-secondary: #666666;
  --accent: #e94560;
  --accent-hover: #d63447;
  --border-color: #e0e0e0;
}

[data-theme="ocean"] {
  --bg-primary: #0a192f;
  --bg-secondary: #112240;
  --bg-hover: #233554;
  --text-primary: #e6f1ff;
  --text-secondary: #8892b0;
  --accent: #64ffda;
  --accent-hover: #4cdbc4;
  --border-color: #233554;
}

[data-theme="sunset"] {
  --bg-primary: #1a1a1a;
  --bg-secondary: #2d2d2d;
  --bg-hover: #404040;
  --text-primary: #fafafa;
  --text-secondary: #b0b0b0;
  --accent: #ff9f43;
  --accent-hover: #f39c12;
  --border-color: #404040;
}

[data-theme="forest"] {
  --bg-primary: #1a1a1a;
  --bg-secondary: #2d3436;
  --bg-hover: #3d4a3d;
  --text-primary: #dfe6e9;
  --text-secondary: #95a5a6;
  --accent: #00b894;
  --accent-hover: #00cec9;
  --border-color: #3d4a3d;
}

[data-theme="pastel"] {
  --bg-primary: #2d2d44;
  --bg-secondary: #3d3d5c;
  --bg-hover: #4d4d6d;
  --text-primary: #f8f8f2;
  --text-secondary: #bfbfbf;
  --accent: #ff79c6;
  --accent-hover: #ff65a3;
  --border-color: #4d4d6d;
}
```

### 5.2 Theme Hook

```tsx
// src/hooks/useTheme.ts
import { create } from "@tanstack/react-store";

type Theme = "dark" | "light" | "ocean" | "sunset" | "forest" | "pastel";

const themeStore = create<{ theme: Theme }>(() => ({
  theme: "dark",
}));

export function useTheme() {
  const theme = themeStore.use((state) => state.theme);
  
  const setTheme = (newTheme: Theme) => {
    themeStore.setState({ theme: newTheme });
    document.documentElement.setAttribute("data-theme", newTheme);
    localStorage.setItem("tierboard-theme", newTheme);
  };
  
  // Load from localStorage on init
  const saved = localStorage.getItem("tierboard-theme") as Theme;
  if (saved && !themeStore.getState().theme) {
    setTheme(saved);
  }
  
  return { theme, setTheme };
}
```

### 5.3 Theme Modal

```tsx
// src/components/modals/ThemeModal.tsx
import { useTheme } from "@hooks/useTheme";

const themes = [
  { id: "dark", name: "Dark", colors: ["#1a1a2e", "#e94560"] },
  { id: "light", name: "Light", colors: ["#ffffff", "#e94560"] },
  { id: "ocean", name: "Ocean", colors: ["#0a192f", "#64ffda"] },
  { id: "sunset", name: "Sunset", colors: ["#1a1a1a", "#ff9f43"] },
  { id: "forest", name: "Forest", colors: ["#1a1a1a", "#00b894"] },
  { id: "pastel", name: "Pastel", colors: ["#2d2d44", "#ff79c6"] },
] as const;

export function ThemeModal({ onClose }: { onClose: () => void }) {
  const { theme, setTheme } = useTheme();
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-[var(--bg-primary)] rounded-xl p-6 max-w-md w-full">
        <h2 className="text-xl font-bold mb-4">Choose Theme</h2>
        <div className="grid grid-cols-3 gap-3">
          {themes.map((t) => (
            <button
              key={t.id}
              onClick={() => { setTheme(t.id as Theme); onClose(); }}
              className={`p-3 rounded-lg border-2 transition-all ${
                theme === t.id 
                  ? "border-[var(--accent)]" 
                  : "border-[var(--border-color)] hover:border-[var(--accent)]"
              }`}
            >
              <div 
                className="w-full h-8 rounded mb-2"
                style={{ background: `linear-gradient(135deg, ${t.colors[0]}, ${t.colors[1]})` }}
              />
              <span className="text-sm">{t.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
```

---

## Step 6: Internationalization (i18n)

### 6.1 Install Paraglide (already in deps)

```bash
# Already installed: @inlang/paraglide-js
```

### 6.2 Create Language Files

```ts
// src/i18n/messages/en.ts
export const en = {
  nav: {
    signIn: "Sign In",
    signOut: "Sign Out",
    billing: "Billing",
    theme: "Theme",
    language: "Language",
  },
  billing: {
    free: "Free",
    pro: "Pro",
    perMonth: "/month",
    upgrade: "Upgrade",
    currentPlan: "Current Plan",
    features: {
      privateBoards: "Private Boards",
      largeRooms: "Up to 50 Users",
      streamIntegration: "Stream Integration",
      unlimitedImages: "Unlimited Images",
      customThemes: "Custom Themes",
    },
  },
  board: {
    createBoard: "Create Board",
    private: "Private",
    public: "Public",
    upgradeForPrivate: "Upgrade to Pro for private boards",
  },
  // Add more as needed
};
```

```ts
// src/i18n/messages/zh.ts
export const zh = {
  nav: {
    signIn: "登录",
    signOut: "退出登录",
    billing: "订阅",
    theme: "主题",
    language: "语言",
  },
  billing: {
    free: "免费版",
    pro: "专业版",
    perMonth: "/月",
    upgrade: "升级",
    currentPlan: "当前计划",
    features: {
      privateBoards: "私密看板",
      largeRooms: "最多50人房间",
      streamIntegration: "直播集成",
      unlimitedImages: "无限图片",
      customThemes: "自定义主题",
    },
  },
  board: {
    createBoard: "创建看板",
    private: "私密",
    public: "公开",
    upgradeForPrivate: "升级到专业版以创建私密看板",
  },
};
```

```ts
// src/i18n/messages/th.ts
export const th = {
  nav: {
    signIn: "เข้าสู่ระบบ",
    signOut: "ออกจากระบบ",
    billing: "การสมัครสมาชิก",
    theme: "ธีม",
    language: "ภาษา",
  },
  // ...
};
```

### 6.3 Create i18n Hook

```tsx
// src/hooks/useI18n.ts
import { create } from "@tanstack/react-store";

type Language = "en" | "zh" | "th" | "es" | "fr" | "de";

const messages: Record<Language, typeof import("./messages/en").en> = {
  en: () => import("./messages/en").then((m) => m.en),
  zh: () => import("./messages/zh").then((m) => m.zh),
  th: () => import("./messages/th").then((m) => m.th),
  es: () => import("./messages/es").then((m) => m.es),
  fr: () => import("./messages/fr").then((m) => m.fr),
  de: () => import("./messages/de").then((m) => m.de),
};

const i18nStore = create<{ language: Language; messages: any }>(() => ({
  language: "en",
  messages: null,
}));

export function useI18n() {
  const { language, messages } = i18nStore.use();
  
  const setLanguage = async (lang: Language) => {
    const newMessages = await messages[lang]();
    i18nStore.setState({ language: lang, messages: newMessages });
    localStorage.setItem("tierboard-language", lang);
  };
  
  // Initialize from localStorage
  if (!i18nStore.getState().messages) {
    const saved = localStorage.getItem("tierboard-language") as Language;
    if (saved && messages[saved]) {
      setLanguage(saved);
    } else {
      setLanguage("en");
    }
  }
  
  return { language, setLanguage, t: messages };
}
```

### 6.4 Language Modal

```tsx
// src/components/modals/LanguageModal.tsx
import { useI18n } from "@hooks/useI18n";

const languages = [
  { code: "en", name: "English", flag: "🇺🇸" },
  { code: "zh", name: "中文", flag: "🇨🇳" },
  { code: "th", name: "ไทย", flag: "🇹🇭" },
  { code: "es", name: "Español", flag: "🇪🇸" },
  { code: "fr", name: "Français", flag: "🇫🇷" },
  { code: "de", name: "Deutsch", flag: "🇩🇪" },
] as const;

export function LanguageModal({ onClose }: { onClose: () => void }) {
  const { language, setLanguage } = useI18n();
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-[var(--bg-primary)] rounded-xl p-6 max-w-sm w-full">
        <h2 className="text-xl font-bold mb-4">Select Language</h2>
        <div className="space-y-2">
          {languages.map((lang) => (
            <button
              key={lang.code}
              onClick={() => { setLanguage(lang.code as any); onClose(); }}
              className={`w-full p-3 rounded-lg flex items-center gap-3 transition-all ${
                language === lang.code
                  ? "bg-[var(--accent)] text-white"
                  : "bg-[var(--bg-secondary)] hover:bg-[var(--bg-hover)]"
              }`}
            >
              <span className="text-2xl">{lang.flag}</span>
              <span>{lang.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
```

---

## Step 7: PartyKit WebSocket Setup

### 7.1 Install PartyKit

```bash
bun add partykit partysocket
bun add -d party
```

### 7.2 PartyKit Configuration

```jsonc
// partykit.jsonc
{
  "name": "tierboard",
  "main": "party/server.ts",
  "compatibilityDate": "2025-02-20",
  "variants": {
    "browser": "party/server.ts"
  }
}
```

### 7.3 PartyKit Server

```ts
// party/server.ts
import type * as Party from "partykit/server";

interface User {
  id: string;
  name: string;
  color: string;
  cursor?: { x: number; y: number };
}

interface RoomState {
  users: Map<string, User>;
  board: any; // Automerge document
}

export default class TierBoardServer implements Party.Server {
  constructor(readonly room: Party.Room) {}

  state: RoomState = {
    users: new Map(),
    board: null,
  };

  onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
    const userId = conn.id;
    
    // Generate deterministic color based on user ID
    const colors = ["#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FFEAA7", "#DDA0DD"];
    const color = colors[userId.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % colors.length];

    const user: User = {
      id: userId,
      name: `User ${userId.slice(0, 4)}`,
      color,
    };

    this.state.users.set(userId, user);

    // Send current state to new user
    conn.send(JSON.stringify({
      type: "sync:init",
      users: Array.from(this.state.users.values()),
      board: this.state.board,
    }));

    // Broadcast new user to all
    this.room.broadcast(JSON.stringify({
      type: "user:joined",
      user,
    }), [conn.id]);
  }

  onClose(conn: Party.Connection) {
    const user = this.state.users.get(conn.id);
    if (user) {
      this.state.users.delete(conn.id);
      
      this.room.broadcast(JSON.stringify({
        type: "user:left",
        userId: conn.id,
      }));
    }
  }

  onMessage(message: string, sender: Party.Connection) {
    const data = JSON.parse(message);

    switch (data.type) {
      case "cursor:move":
        // Update user cursor
        const user = this.state.users.get(sender.id);
        if (user) {
          user.cursor = { x: data.x, y: data.y };
          this.room.broadcast(JSON.stringify({
            type: "cursor:update",
            userId: sender.id,
            cursor: user.cursor,
          }), [sender.id]);
        }
        break;

      case "board:change":
        // Broadcast board changes to all users
        this.room.broadcast(JSON.stringify({
          type: "board:change",
          change: data.change,
          userId: sender.id,
        }), [sender.id]);
        break;

      case "user:name":
        // Update user name
        const namedUser = this.state.users.get(sender.id);
        if (namedUser) {
          namedUser.name = data.name;
          this.room.broadcast(JSON.stringify({
            type: "user:update",
            user: namedUser,
          }));
        }
        break;
    }
  }
}
```

### 7.4 Client-Side PartySocket Hook

```ts
// src/hooks/usePartySocket.ts
import { useEffect, useState, useCallback, useRef } from "react";
import PartySocket from "partysocket";
import { useAuth } from "@clerk/clerk-react";

interface UsePartySocketOptions {
  roomId: string;
  host?: string;
}

interface User {
  id: string;
  name: string;
  color: string;
  cursor?: { x: number; y: number };
}

export function usePartySocket({ roomId, host }: UsePartySocketOptions) {
  const { user } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<PartySocket | null>(null);

  useEffect(() => {
    const socket = new PartySocket({
      host: host || import.meta.env.VITE_PARTYKIT_HOST || "localhost:1999",
      room: roomId,
    });

    socketRef.current = socket;

    socket.addEventListener("open", () => {
      setIsConnected(true);
    });

    socket.addEventListener("close", () => {
      setIsConnected(false);
    });

    socket.addEventListener("message", (event) => {
      const data = JSON.parse(event.data);

      switch (data.type) {
        case "sync:init":
          setUsers(data.users);
          break;

        case "user:joined":
          setUsers((prev) => [...prev, data.user]);
          break;

        case "user:left":
          setUsers((prev) => prev.filter((u) => u.id !== data.userId));
          break;

        case "cursor:update":
          setUsers((prev) =>
            prev.map((u) =>
              u.id === data.userId ? { ...u, cursor: data.cursor } : u
            )
          );
          break;

        case "user:update":
          setUsers((prev) =>
            prev.map((u) => (u.id === data.user.id ? data.user : u))
          );
          break;

        case "board:change":
          // Handle board sync - emit to board state
          break;
      }
    });

    return () => {
      socket.close();
    };
  }, [roomId, host]);

  const sendCursor = useCallback((x: number, y: number) => {
    socketRef.current?.send(JSON.stringify({
      type: "cursor:move",
      x,
      y,
    }));
  }, []);

  const sendBoardChange = useCallback((change: any) => {
    socketRef.current?.send(JSON.stringify({
      type: "board:change",
      change,
    }));
  }, []);

  return {
    users,
    isConnected,
    sendCursor,
    sendBoardChange,
  };
}
```

### 7.5 Switch Between P2P and PartyKit

```tsx
// src/components/board/BoardRoom.tsx
import { useAuth, has } from "@clerk/clerk-react";
import { useP2PNetwork } from "@/hooks/useP2PNetwork";
import { usePartySocket } from "@/hooks/usePartySocket";

export function BoardRoom({ roomId }: { roomId: string }) {
  const { has } = useAuth();
  
  // Check if user can use large rooms
  const canUseLargeRoom = has({ feature: "large_rooms" });
  
  // For large rooms (10+ users), use PartyKit
  // For small rooms, use P2P
  const useWebSocket = roomId.startsWith("party:") || canUseLargeRoom;
  
  if (useWebSocket) {
    const { users, sendCursor, sendBoardChange } = usePartySocket({
      roomId,
    });
    
    return (
      <BoardView
        users={users}
        onCursorMove={sendCursor}
        onBoardChange={sendBoardChange}
      />
    );
  }
  
  // P2P mode
  const { peers, network } = useP2PNetwork();
  // ... P2P implementation
}
```

---

## Step 8: Feature Gating Hooks

### 8.1 Create Subscription Hook

```tsx
// src/hooks/useSubscription.ts
import { useAuth, has } from "@clerk/clerk-react";

interface SubscriptionFeatures {
  canCreatePrivateBoard: boolean;
  canUseLargeRoom: boolean;
  canUseStreamIntegration: boolean;
  hasUnlimitedImages: boolean;
  canUseCustomThemes: boolean;
  maxImageUploads: number;
  maxRoomSize: number;
}

export function useSubscription(): SubscriptionFeatures {
  const { has } = useAuth();
  
  // These check against Clerk's subscription data
  const canCreatePrivateBoard = has({ plan: "pro" });
  const canUseLargeRoom = has({ feature: "large_rooms" });
  const canUseStreamIntegration = has({ feature: "stream_integration" });
  const hasUnlimitedImages = has({ plan: "pro" });
  const canUseCustomThemes = has({ plan: "pro" });
  
  // Free tier limits
  const maxImageUploads = hasUnlimitedImages ? Infinity : 10;
  const maxRoomSize = canUseLargeRoom ? 50 : 10;
  
  return {
    canCreatePrivateBoard,
    canUseLargeRoom,
    canUseStreamIntegration,
    hasUnlimitedImages,
    canUseCustomThemes,
    maxImageUploads,
    maxRoomSize,
  };
}
```

### 8.2 Usage in Components

```tsx
// src/components/board/CreateBoardModal.tsx
import { useSubscription } from "@/hooks/useSubscription";

export function CreateBoardModal() {
  const { canCreatePrivateBoard, maxImageUploads } = useSubscription();
  const [isPrivate, setIsPrivate] = useState(false);
  
  const handleSubmit = () => {
    if (isPrivate && !canCreatePrivateBoard) {
      // Show upgrade prompt
      return;
    }
    // Create board...
  };
  
  return (
    <div>
      <label>
        <input
          type="checkbox"
          checked={isPrivate}
          onChange={(e) => setIsPrivate(e.target.checked)}
        />
        Private Board
      </label>
      
      {isPrivate && !canCreatePrivateBoard && (
        <div className="upgrade-prompt">
          <p>Upgrade to Pro for private boards</p>
          <button>Upgrade Now</button>
        </div>
      )}
    </div>
  );
}
```

---

## Step 9: Implementation Order

### Phase 1: Authentication (Priority: High)
1. Install Clerk SDK
2. Configure environment variables
3. Set up ClerkProvider in __root.tsx
4. Add sign-in modal to header
5. Create UserMenu component

### Phase 2: User Features (Priority: High)
1. Theme system (hooks + CSS + modal)
2. Language system (i18n + modal)
3. User dropdown menu integration

### Phase 3: Billing (Priority: High)
1. Configure billing in Clerk Dashboard
2. Create billing modal with PricingTable
3. Add subscription check hooks

### Phase 4: WebSocket Relay (Priority: Medium)
1. Set up PartyKit server
2. Create usePartySocket hook
3. Implement cursor presence over WebSocket
4. Switch between P2P and WebSocket based on room size

### Phase 5: Feature Gating (Priority: Medium)
1. Create useSubscription hook
2. Gate private boards
3. Gate large rooms
4. Gate stream integration

---

## File Changes Summary

| File | Action |
|------|--------|
| `.env` | Add Clerk + PartyKit keys |
| `package.json` | Add `@clerk/clerk-react`, `partykit`, `partysocket` |
| `party/server.ts` | NEW - PartyKit WebSocket server |
| `partykit.jsonc` | NEW - PartyKit config |
| `src/styles/themes.css` | NEW - Theme CSS variables |
| `src/hooks/useTheme.ts` | NEW - Theme hook |
| `src/hooks/useI18n.ts` | NEW - i18n hook |
| `src/hooks/usePartySocket.ts` | NEW - WebSocket hook |
| `src/hooks/useSubscription.ts` | NEW - Subscription check |
| `src/i18n/messages/*.ts` | NEW - Language files |
| `src/components/modals/SignInModal.tsx` | NEW |
| `src/components/modals/BillingModal.tsx` | NEW |
| `src/components/modals/ThemeModal.tsx` | NEW |
| `src/components/modals/LanguageModal.tsx` | NEW |
| `src/components/user-menu/UserMenu.tsx` | NEW |
| `src/routes/__root.tsx` | MODIFY - Add ClerkProvider |

---

## Environment Variables

```env
# Clerk (get from https://dashboard.clerk.com/)
VITE_CLERK_PUBLISHABLE_KEY=pk_test_xxxxx
CLERK_SECRET_KEY=sk_test_xxxxx

# PartyKit
VITE_PARTYKIT_HOST=localhost:1999  # Development
# VITE_PARTYKIT_HOST=your-app.partykit.dev  # Production
```

---

## Testing Checklist

- [ ] Google OAuth sign-in works
- [ ] Sign-out clears session
- [ ] Theme changes persist across refresh
- [ ] Language changes apply to all strings
- [ ] Billing modal shows pricing
- [ ] Subscription gating blocks unpaid features
- [ ] WebSocket connects in large rooms
- [ ] Cursors sync across WebSocket
- [ ] P2P still works for small rooms

---

## Next Steps

1. **Start with Phase 1**: Get Clerk authentication working
2. **Then Phase 2-3**: Add user menu, themes, billing
3. **Then Phase 4-5**: PartyKit WebSocket and feature gating
