# Redesign "Cinema" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle every screen of Zapp to the approved "Cinema" direction (true black, white, purple, Apple-like) without changing data flow, auth, routing or Server Actions.

**Architecture:** Tokens change in `globals.css`; three new shared pieces (`PosterWall`, `FloatingNav`, `glass` utility) plus restyled primitives (`Button`, `Card`, `Sheet`, `TopBar`, `PosterCard`, `Avatar`). Then each route is restyled to match its mockup file in `docs/design/mockups/*.dc.html`, which is the pixel source of truth (inline styles carry exact px values, colors, radii). One new server read: `getWallPosters()` (TMDB trending, 24 h cache).

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript strict, Tailwind CSS 4 (`@theme`), Framer Motion (already present), Supabase, TMDB. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-04-redesign-cinema-design.md`

## Global Constraints

- No external UI libraries; icons are inline SVG, stroke 1.8, 24-grid, stroke-linecap/linejoin round.
- No TMDB calls from the client; `PosterWall` receives `posters: string[]` from a Server Component.
- Colors only via the tokens in Task 1 (Tailwind classes `bg-bg`, `text-muted`, `bg-accent`, ...). Literal hex allowed only for per-genre colors (`GENRE_COLORS`) and provider brand red `#E50914`.
- Fonts: Inter self-hosted (unchanged). Copy (labels, messages) unchanged unless the spec says otherwise.
- Minimum tap target 44 px; CTA height 54 px; inputs 54 px; nav 64 px.
- `prefers-reduced-motion: reduce` disables the poster wall animation.
- Desktop (`lg+`): the app must use the FULL available width (sidebar 240px + content full width, `lg:px-8 xl:px-12`, inner `max-w-[1600px]`), never a 480px column centered on screen. Grids expand (`md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10`), shelves scroll full width, auth/onboarding become a two-column split (55% PosterWall full-height with wordmark bottom-left, 45% form centered in `max-w-[440px]` card without bottom sheet), home hero is full-bleed `lg:h-[520px]` with a `max-w-[720px]` text block. Existing `lg:` side-by-side grids in friends/profile/title stay. FloatingNav and fixed action bars are `lg:hidden`; the title action bar becomes an in-page row on desktop. See spec section "Desktop".
- TMDB attribution stays visible in the profile footer.
- Verification per task: `pnpm typecheck && pnpm lint`. Final: `pnpm build`.
- Prettier: double quotes, trailing commas, printWidth 90. Comments in Italian.
- Commit after every task with a `feat(ui): ...` message; end commit messages with the attribution trailer required by the session.

---

## File map

Create:
- `src/lib/tmdb/wall.ts` — `getWallPosters()`, server-only.
- `src/lib/genre-colors.ts` — `GENRE_COLORS`, `genreColor(name)`.
- `src/components/marketing/PosterWall.tsx` — animated wall (client-free, pure CSS).
- `src/components/layout/FloatingNav.tsx` — mobile pill nav (client, `usePathname`).
- `src/components/layout/GlassIconButton.tsx` — 40 px glass circle (button or link).
- `src/components/profile/AvatarPicker.tsx` — avatar + camera badge + upload (client), extracted from `ProfileEditor`.
- `src/components/profile/GenreBar.tsx` — proportional genre bar + legend.
- `src/components/home/HeroWatching.tsx` — home hero.
- `src/components/social/FriendsStrip.tsx` — horizontal avatar strip.
- `src/components/social/InviteCard.tsx` — empty state with copy + share (client).

Modify: `src/app/globals.css`, `src/components/ui/{Button,Card,Sheet,PosterCard,EmptyState}.tsx`, `src/components/layout/{TopBar,BottomNav,BackButton,PageShell}.tsx`, `src/components/social/{Avatar,NotificationsBell}.tsx`, `src/app/(auth)/layout.tsx`, `src/app/(auth)/login/page.tsx`, `src/app/(auth)/signup/page.tsx`, `src/app/onboarding/{page,OnboardingForm}.tsx`, `src/app/(app)/page.tsx`, `src/components/home/{WatchingCard,RecommendationsSection}.tsx`, `src/app/(app)/search/{page,SearchClient}.tsx`, `src/components/discover/{DiscoverSections,HorizontalShelf}.tsx`, `src/app/(app)/friends/{page,FeedList,RequestRow,UserSearch}.tsx`, `src/app/(app)/library/{page,LibraryGrid}.tsx`, `src/app/(app)/profile/{page,ProfileEditor,LogoutButton}.tsx`, `src/components/title/*.tsx`, `src/app/(app)/title/tv/[id]/season/[n]/page.tsx`, `src/components/title/EpisodeRow.tsx`, `src/app/(app)/notifications/page.tsx`, `src/app/(app)/import/netflix/ImportClient.tsx`, `src/app/(app)/u/[username]/page.tsx`, `src/app/layout.tsx` (themeColor), `src/app/manifest.ts` (colors).

---

### Task 1: Tokens, glass utility, primitives

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/components/ui/Button.tsx`, `src/components/ui/Card.tsx`, `src/components/ui/Sheet.tsx`, `src/components/ui/PosterCard.tsx`, `src/components/ui/EmptyState.tsx`
- Modify: `src/app/layout.tsx` (`themeColor: "#000000"`), `src/app/manifest.ts` (`background_color`/`theme_color` → `#000000`)

**Interfaces:**
- Produces: Tailwind color classes `bg-bg bg-surface bg-surface-2 border-border text-text text-muted text-muted-2 bg-accent bg-accent-strong text-accent-soft text-accent-pale text-danger`; utility classes `.glass`, `.glass-strong`, `.shadow-accent`; `Button` variants `primary | secondary | ghost | danger`.

- [ ] **Step 1: Replace the `@theme` block and add utilities in `globals.css`**

```css
@import "tailwindcss";

@theme {
  --color-bg: #000000;
  --color-surface: #0e0e12;
  --color-surface-2: #1c1c1e;
  --color-sheet: #0a0a0c;
  --color-border: rgba(255, 255, 255, 0.07);
  --color-text: #ffffff;
  --color-muted: #8e8e93;
  --color-muted-2: #6e6e73;
  --color-accent: #8b5cf6;
  --color-accent-strong: #7c3aed;
  --color-accent-soft: #a78bfa;
  --color-accent-pale: #c4b5fd;
  --color-danger: #f87171;
  --shadow-accent: 0 8px 28px rgba(139, 92, 246, 0.35);
  --shadow-card: 0 20px 50px rgba(0, 0, 0, 0.6);
}

html {
  color-scheme: dark;
}

body {
  background-color: var(--color-bg);
  color: var(--color-text);
  -webkit-tap-highlight-color: transparent;
}

/* Vetro: pannelli e bottoni traslucidi sopra immagini */
.glass {
  background-color: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.14);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
}
.glass-strong {
  background-color: rgba(28, 28, 30, 0.72);
  border: 1px solid rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  box-shadow:
    0 20px 50px rgba(0, 0, 0, 0.6),
    inset 0 1px 0 rgba(255, 255, 255, 0.08);
}

/* Safe area iOS per bottom nav e contenuti */
.pb-safe {
  padding-bottom: env(safe-area-inset-bottom, 0px);
}

/* scroll orizzontale senza scrollbar visibile */
.scrollbar-none {
  scrollbar-width: none;
}
.scrollbar-none::-webkit-scrollbar {
  display: none;
}

::selection {
  background-color: var(--color-accent);
  color: white;
}
```

- [ ] **Step 2: Rewrite `Button.tsx`**

```tsx
import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-accent text-white shadow-[var(--shadow-accent)] hover:bg-accent-strong disabled:opacity-50",
  secondary: "glass text-text hover:bg-white/15 disabled:opacity-50",
  ghost: "text-text hover:bg-surface disabled:opacity-50",
  danger:
    "border border-danger/20 bg-danger/10 text-danger hover:bg-danger/15 disabled:opacity-50",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

/** Pillola h-54 (h-14 in Tailwind = 56px, usiamo h-[54px] per il mockup). */
export function Button({ variant = "primary", className = "", ...props }: ButtonProps) {
  return (
    <button
      className={`inline-flex h-[54px] items-center justify-center gap-2 rounded-full px-6 text-[17px] font-semibold transition-colors ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}
```

- [ ] **Step 3: `Card.tsx`** → `rounded-[20px] border border-border bg-surface` (keep its props).

- [ ] **Step 4: `Sheet.tsx`** → panel classes `pb-safe fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-[480px] rounded-t-[32px] border-t border-white/10 bg-sheet px-4 pt-3.5 shadow-[0_-20px_60px_rgba(0,0,0,0.7)]`, handle `mx-auto mb-4 h-[5px] w-9 rounded-full bg-white/[0.18]`, backdrop `fixed inset-0 z-40 bg-black/60 backdrop-blur-sm`.

- [ ] **Step 5: `PosterCard.tsx`** → poster wrapper `rounded-[14px] bg-surface-2`, provider badges `size-5 rounded-md border border-black/50`, caption `mt-2 text-[13px] font-medium leading-tight`; split the rating out: add prop `rating?: number | null` rendering `<span className="text-[11px] font-semibold text-accent-soft">★ {rating}</span>` on its own line under the title, and `year` in `text-muted text-[11px]`. Callers that today pass `` `★ ${rating} · ${name}` `` as `title` (home, library, profile, public profile) will be updated in their tasks; keep accepting the old string form so nothing breaks in between.

- [ ] **Step 6: `EmptyState.tsx`** → container `rounded-[20px] border border-border bg-surface px-6 py-8 text-center`, title `text-lg font-bold tracking-[-0.02em]`, description `mt-1.5 text-sm text-muted text-pretty`.

- [ ] **Step 7: `layout.tsx` themeColor `#000000`; `manifest.ts` colors `#000000`.**

- [ ] **Step 8: Verify** `pnpm typecheck && pnpm lint` → pass.

- [ ] **Step 9: Commit** `feat(ui): token neri e viola, glass utility, primitivi pillola`

---

### Task 2: PosterWall + getWallPosters

**Files:**
- Create: `src/lib/tmdb/wall.ts`, `src/components/marketing/PosterWall.tsx`
- Modify: `src/lib/tmdb/client.ts` only if `getTrending()` lacks a `revalidate` of 86400 (check; add a `revalidate` option if needed).

**Interfaces:**
- Produces: `getWallPosters(): Promise<string[]>` (server-only, 16 TMDB `poster_path`s, may be fewer); `PosterWall` props `{ posters: string[]; height?: number; blur?: number; opacity?: number; speed?: "normal" | "slow"; className?: string }`.

- [ ] **Step 1: `src/lib/tmdb/wall.ts`**

```ts
import "server-only";
import { getTrending } from "@/lib/tmdb/client";
import { createServiceClient } from "@/lib/supabase/server";

const WALL_SIZE = 16;

/**
 * Locandine per il muro di sfondo (login, onboarding, profilo):
 * sempre i titoli più nuovi e popolari, da TMDB trending settimanale.
 * Fallback: ultime locandine in cache locale.
 */
export async function getWallPosters(): Promise<string[]> {
  try {
    const trending = await getTrending();
    const paths = trending.results
      .filter((r) => (r.media_type === "movie" || r.media_type === "tv") && r.poster_path)
      .map((r) => r.poster_path as string)
      .slice(0, WALL_SIZE);
    if (paths.length >= 8) return paths;
  } catch {
    // TMDB non raggiungibile: si usa la cache
  }
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("titles")
    .select("poster_path")
    .not("poster_path", "is", null)
    .order("fetched_at", { ascending: false })
    .limit(WALL_SIZE);
  return (data ?? []).map((t) => t.poster_path as string);
}
```

Check `getTrending` in `client.ts`: it must use `next: { revalidate: 86400 }` or an equivalent per-endpoint revalidate; if it is shorter, keep it (trending is already cached) — do not lower it.

- [ ] **Step 2: `PosterWall.tsx`** (Server Component, no `"use client"`)

```tsx
import { posterUrl } from "@/lib/config";

interface Props {
  posters: string[];
  /** altezza del riquadro in px */
  height?: number;
  blur?: number;
  opacity?: number;
  speed?: "normal" | "slow";
  className?: string;
}

const DURATIONS = { normal: [46, 58, 52, 64], slow: [90, 104, 96, 110] } as const;

/**
 * Muro di locandine in prospettiva, 4 colonne che scorrono in loop infinito.
 * Ogni colonna ripete 3 volte la sua lista e trasla di un terzo: nessun buco.
 */
export function PosterWall({
  posters,
  height = 640,
  blur = 0,
  opacity = 1,
  speed = "normal",
  className = "",
}: Props) {
  const cols = [0, 1, 2, 3].map((c) => posters.filter((_, i) => i % 4 === c).slice(0, 4));
  const offsets = [0, -300, -60, -340];
  const durations = DURATIONS[speed];
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute -left-[70px] -top-[120px] w-[540px] overflow-hidden ${className}`}
      style={{
        height,
        perspective: 1000,
        filter: blur ? `blur(${blur}px)` : undefined,
        opacity,
      }}
    >
      <div
        className="flex gap-3"
        style={{
          transform: "rotateX(24deg) rotateZ(-8deg) translateY(-40px)",
          transformOrigin: "50% 0%",
        }}
      >
        {cols.map((col, c) => (
          <div
            key={c}
            className={`wall-col flex flex-col gap-3 pb-3 ${c % 2 ? "wall-down" : "wall-up"}`}
            style={{ marginTop: offsets[c], animationDuration: `${durations[c]}s` }}
          >
            {[...col, ...col, ...col].map((path, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={`${path}-${i}`}
                src={posterUrl(path, "w185") ?? ""}
                alt=""
                width={112}
                height={168}
                loading={i < 4 ? "eager" : "lazy"}
                className="h-[168px] w-[112px] rounded-xl bg-surface-2 object-cover shadow-[0_10px_30px_rgba(0,0,0,0.55)]"
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
```

Add to `globals.css`:

```css
/* Muro di locandine: loop infinito, un terzo dell'altezza per ciclo */
@keyframes wall-up {
  from { transform: translateY(0); }
  to { transform: translateY(-33.333%); }
}
@keyframes wall-down {
  from { transform: translateY(-33.333%); }
  to { transform: translateY(0); }
}
.wall-col { will-change: transform; animation-timing-function: linear; animation-iteration-count: infinite; }
.wall-up { animation-name: wall-up; }
.wall-down { animation-name: wall-down; }
@media (prefers-reduced-motion: reduce) {
  .wall-col { animation: none; }
}
```

Plain `<img>` is deliberate (16 small images, `next/image` would add 16 optimizer requests); `posterUrl` returns `null` for null paths, so filter nulls upstream.

- [ ] **Step 3: Verify** `pnpm typecheck && pnpm lint`.
- [ ] **Step 4: Commit** `feat(ui): PosterWall con locandine trending`

---

### Task 3: FloatingNav, TopBar, BackButton, GlassIconButton, Avatar

**Files:**
- Create: `src/components/layout/FloatingNav.tsx`, `src/components/layout/GlassIconButton.tsx`
- Modify: `src/components/layout/BottomNav.tsx`, `TopBar.tsx`, `BackButton.tsx`, `PageShell.tsx`, `src/components/social/Avatar.tsx`, `src/components/social/NotificationsBell.tsx`, `src/app/(app)/layout.tsx`

**Interfaces:**
- Produces: `<FloatingNav />` (mobile only, `lg:hidden`); `BottomNav` keeps the desktop sidebar (`hidden lg:flex`); `<GlassIconButton href? onClick? label>` renders a 40 px `.glass` circle with children SVG; `TopBar` props unchanged, new look; `Avatar` shows gradient initial.

- [ ] **Step 1: `FloatingNav.tsx`** — move `TABS` out of `BottomNav.tsx` into `src/components/layout/tabs.tsx` (export `TABS`) and use it in both. Markup per mockup `Home.dc.html` nav block:

```tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { TABS } from "./tabs";

export function FloatingNav() {
  const pathname = usePathname();
  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 h-[140px] bg-gradient-to-b from-transparent via-black/85 to-black lg:hidden" />
      <nav
        className="glass-strong fixed inset-x-4 z-30 mx-auto flex h-16 max-w-[448px] items-center justify-between rounded-full px-1.5 lg:hidden"
        style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 22px)" }}
      >
        {TABS.map((tab) => {
          const active =
            pathname === tab.href || (tab.href !== "/" && pathname.startsWith(`${tab.href}/`));
          return (
            <Link
              key={tab.label}
              href={tab.href}
              className={`flex h-[52px] w-[62px] flex-col items-center justify-center gap-[3px] rounded-full text-[10px] font-medium ${
                active ? "bg-accent/[0.22] text-accent-pale" : "text-muted"
              }`}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                {tab.icon}
              </svg>
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
```

- [ ] **Step 2: `BottomNav.tsx`** → keep only the desktop sidebar (`hidden lg:flex ...` root); mobile branch removed. `(app)/layout.tsx` renders `<BottomNav />` and `<FloatingNav />`.
- [ ] **Step 3: `GlassIconButton.tsx`**

```tsx
import Link from "next/link";
import type { ReactNode } from "react";

interface Props {
  label: string;
  href?: string;
  onClick?: () => void;
  children: ReactNode;
  className?: string;
}

/** Cerchio 40px in vetro con icona: azione in testata sopra immagini. */
export function GlassIconButton({ label, href, onClick, children, className = "" }: Props) {
  const cls = `glass flex size-10 items-center justify-center rounded-full text-text ${className}`;
  if (href) {
    return (
      <Link href={href} aria-label={label} className={cls}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" aria-label={label} onClick={onClick} className={cls}>
      {children}
    </button>
  );
}
```

- [ ] **Step 4: `TopBar.tsx`** → `header` classes `sticky top-0 z-20 flex items-center justify-between bg-bg/80 px-5 pb-4 pt-[calc(env(safe-area-inset-top,0px)+40px)] backdrop-blur-xl`, title `text-[34px] font-bold leading-none tracking-[-0.045em]`.
- [ ] **Step 5: `BackButton.tsx`** → use `GlassIconButton` with the chevron path `M15 5l-7 7 7 7` (stroke 2), positioned `absolute left-5 top-[calc(env(safe-area-inset-top,0px)+40px)] z-20`.
- [ ] **Step 6: `NotificationsBell.tsx`** → `GlassIconButton href="/notifications"` with bell path (`M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z` + `M10 20a2 2 0 0 0 4 0`) and, when unread, a `absolute right-2 top-2 size-[9px] rounded-full border-2 border-bg bg-accent` dot (wrap in `relative`).
- [ ] **Step 7: `Avatar.tsx`** → fallback `bg-gradient-to-br from-accent-soft to-accent-strong text-white font-bold` with initial; keep `size` prop.
- [ ] **Step 8: `PageShell.tsx`** → bottom padding for pages: ensure main content has `pb-36` on mobile (search for `pb-28` across `src/app` and replace with `pb-36`).
- [ ] **Step 9: Verify** `pnpm typecheck && pnpm lint`.
- [ ] **Step 10: Commit** `feat(ui): nav flottante in vetro, top bar e pulsanti vetro`

---

### Task 4: Auth layout, Login, Signup, Controlla email

**Files:**
- Modify: `src/app/(auth)/layout.tsx`, `src/app/(auth)/login/page.tsx`, `src/app/(auth)/signup/page.tsx`, `src/components/auth/GoogleButton.tsx`
- Reference: `docs/design/mockups/Main.dc.html`, `Signup.dc.html`, `CheckEmail.dc.html`

- [ ] **Step 1: Layout** — `(auth)/layout.tsx` becomes an async Server Component: `const posters = await getWallPosters()`. Root `div.relative.mx-auto.flex.min-h-dvh.w-full.max-w-[480px].flex-col.justify-end.overflow-hidden.bg-bg`; `<PosterWall posters={posters} height={640} />`; gradient overlay `absolute inset-x-0 top-0 h-[560px] bg-[linear-gradient(180deg,rgba(0,0,0,.35)_0%,rgba(0,0,0,.05)_22%,rgba(0,0,0,.55)_58%,rgba(0,0,0,.92)_82%,#000_100%)]`; purple glow `absolute -left-[120px] top-[260px] h-80 w-[420px] rounded-full bg-[radial-gradient(circle,rgba(139,92,246,.35)_0%,rgba(139,92,246,.10)_45%,transparent_70%)] blur-[40px]`. Children render inside a sheet: `relative rounded-t-[32px] border-t border-white/10 bg-sheet px-6 pb-9 pt-3.5 shadow-[0_-20px_60px_rgba(0,0,0,0.7)]` with handle. The headline block (wordmark or page title) is provided by each page via a small client-free component `AuthHeadline` (`src/components/auth/AuthHeadline.tsx`) rendered by the page above the form, absolutely positioned `left-6 top-[318px]` (login) — simpler: layout renders children as a fragment and each page renders `<AuthHeadline title=... subtitle=... />` then `<AuthSheet>form</AuthSheet>`. Implement `AuthHeadline` (`absolute left-6 top-[262px] flex flex-col gap-2`; title `text-[40px] font-bold leading-[1.02] tracking-[-0.045em]` with `<span className="text-accent">.</span>`; wordmark variant `text-[56px] tracking-[-0.05em]`) and `AuthSheet`.
- [ ] **Step 2: Login** — fields `h-[54px] w-full rounded-[14px] bg-surface-2 px-[18px] text-base text-text placeholder:text-muted outline-none focus:ring-4 focus:ring-accent/15 focus:border focus:border-accent`, no visible labels (use `aria-label` + placeholder "Email" / "Password"); stack gap 10; `Button` primary full width "Accedi"; divider "oppure" (`h-px flex-1 bg-white/10`, text `text-xs text-muted`); Google button white: `h-[54px] rounded-[14px] bg-white text-black font-medium` (update `GoogleButton.tsx`); footer "Non hai un account? Registrati" (`text-sm text-muted`, link `font-semibold text-accent-soft`).
- [ ] **Step 3: Signup** — `AuthHeadline title="Crea il tuo account" subtitle="Tieni traccia di film e serie, scopri dove vederli."`; hint under password `text-xs text-muted-2 px-1` "Almeno 8 caratteri."; CTA "Crea account"; footer "Hai già un account? Accedi". Check-email state: wall blur 6 / opacity .55 is a layout concern → pages pass `wallVariant` via a route segment? Simplest: `AuthHeadline` gets an `icon` slot; the check-email view renders the envelope icon box (68px, `rounded-[22px] bg-accent/[0.16] border border-accent/45 shadow-[0_0_0_10px_rgba(139,92,246,0.08)]`) + title "Controlla la tua email" + text, and the sheet shows the email row (`h-[54px] rounded-[14px] bg-surface-2 flex items-center justify-between px-[18px] text-[15px] text-muted`) with "Inviata" + check in `text-accent-soft`. The wall blur for this state is skipped (acceptable deviation, note in commit).
- [ ] **Step 4: Verify** `pnpm typecheck && pnpm lint`; open `/login` at 390 px in the browser (`pnpm dev`), confirm the wall scrolls with no gaps and the sheet sits at the bottom.
- [ ] **Step 5: Commit** `feat(ui): login, signup e conferma email con muro di locandine`

---

### Task 5: Onboarding + AvatarPicker

**Files:**
- Create: `src/components/profile/AvatarPicker.tsx`
- Modify: `src/app/onboarding/page.tsx`, `src/app/onboarding/OnboardingForm.tsx`, `src/app/(app)/profile/ProfileEditor.tsx`
- Reference: `Onboarding.dc.html`

- [ ] **Step 1: `AvatarPicker`** (client) — extract `resizeImage` + `handleAvatar` + hidden file input from `ProfileEditor` into `AvatarPicker({ userId, initialUrl, name, size = 92, onChange? })`. Renders avatar (photo or gradient initial), white camera badge 34 px (`absolute -bottom-1 -right-1 size-[34px] rounded-full bg-white border-[3px] border-bg`, camera SVG stroke black 2), and a "Cambia foto" text button (`text-sm font-semibold text-accent-soft`). `ProfileEditor` uses it.
- [ ] **Step 2: Onboarding page** — Server Component: `posters = await getWallPosters()`; wall `blur={10} opacity={0.45} height={520}`; overlay gradient; header block `absolute left-6 top-[132px] w-[342px] flex flex-col gap-[22px]`: photo row (`AvatarPicker` + column "Foto profilo" `text-[15px] font-semibold`, hint `text-[13px] text-white/60` "Tocca per scegliere una foto. Puoi farlo anche dopo."), title `text-4xl font-bold tracking-[-0.045em]` "Scegli il tuo username." + subtitle (existing copy). Form inside bottom sheet (same `AuthSheet` from Task 4, move `AuthSheet` to `src/components/layout/BottomSheetStatic.tsx` so both routes import it).
- [ ] **Step 3: `OnboardingForm`** — username field with `@` prefix: wrapper `flex h-[54px] items-center gap-0.5 rounded-[14px] bg-surface-2 px-[18px] focus-within:border focus-within:border-accent focus-within:ring-4 focus-within:ring-accent/15`, `<span className="text-muted">@</span><input className="flex-1 bg-transparent text-[17px] font-medium outline-none" .../>`; hint `text-xs text-muted-2 px-1`; display-name field with trailing "opzionale" (`text-xs text-muted-2`) inside the box and caption "Nome visualizzato" under; CTA `Button` primary full "Inizia a usare Zapp".
- [ ] **Step 4: Verify** typecheck + lint. **Commit** `feat(ui): onboarding con foto profilo e muro sfocato`

---

### Task 6: Home

**Files:**
- Create: `src/components/home/HeroWatching.tsx`
- Modify: `src/app/(app)/page.tsx`, `src/components/home/WatchingCard.tsx`, `src/components/home/RecommendationsSection.tsx`, `src/components/discover/HorizontalShelf.tsx`
- Reference: `Home.dc.html`, `HomeFull.dc.html`

- [ ] **Step 1: `HorizontalShelf`** — title `text-xl font-bold tracking-[-0.03em]`, "Vedi tutti" `text-[13px] font-medium text-accent-soft`, row `flex gap-3 overflow-x-auto px-5 scrollbar-none`.
- [ ] **Step 2: `HeroWatching`** (Server Component, props: `entry: EntryWithTitle`, `info` from `continueInfo`, `progressLabel`, `progressPct`, `isSeries`) — backdrop `backdropUrl(title.backdrop_path, "w780")` via `next/image` `fill priority` inside `relative h-[420px] overflow-hidden`, `scale-[1.12] origin-[50%_30%]`; overlay gradient from mockup; glow; content `absolute left-5 top-[232px] w-[350px] flex flex-col gap-3`: label `text-[13px] font-medium text-accent-soft` "Continua a guardare", title `text-[40px] font-bold leading-none tracking-[-0.045em]`, chip row (`glass rounded-full py-[5px] pl-[5px] pr-2.5 flex items-center gap-2` with provider logo 22 px `rounded-md` + name `text-xs font-medium`; season text `text-[13px] text-white/70` "Stagione n, episodio m"), progress `h-1 rounded-full bg-white/[0.14]` with `bg-accent` fill, buttons: `<a href={continueUrl} target="_blank" rel="noopener">` styled `flex-1 h-[52px] rounded-full bg-accent shadow-[var(--shadow-accent)] text-base font-semibold flex items-center justify-center gap-2` with play SVG "Continua"; the "+1 ep" button reuses `WatchingCard`'s `plusOne` logic → extract that into `src/components/home/PlusOneButton.tsx` (client; props `titleId`, `className`) and use it in both. If `continueUrl` is null, link to the title page instead ("Apri scheda").
- [ ] **Step 3: `page.tsx`** — remove `TopBar`; when `watching.length > 0`: `HeroWatching` for `watching[0]`, then section "In corso" with `watching.slice(1)` as `WatchingCard`s (restyle: poster `rounded-[14px]`, logo 22 px at `left-1.5 bottom-2.5`, 3 px progress bar, name `text-[13px] font-medium truncate`, meta `text-[11px] text-muted`; remove the per-card "Continua"/"+1" buttons since the hero carries them — keep `PlusOneButton` only in hero). If `watching.length === 0` but not `empty`: hero replaced by a 420 px `PosterWall` (`getWallPosters()`) with wordmark-free gradient and the first section starts at top. Empty state: wall + existing `EmptyState` with two `Button`s. Sections gap `space-y-8`, first section `mt-8` after hero (mockup: hero 420 + 32).
- [ ] **Step 4: `RecommendationsSection`** — card `flex items-center gap-3 rounded-[20px] border border-border bg-surface p-2.5`, poster `h-[72px] w-12 rounded-[10px]`, title `text-[15px] font-semibold truncate`, second line with `Avatar size={18}` + `text-xs text-muted` "Nome: «messaggio»", button `h-9 rounded-full border border-accent/40 bg-accent/[0.18] px-3.5 text-xs font-semibold text-accent-pale` "Voglio vederlo".
- [ ] **Step 5: "Visti di recente"** — pass `rating` to `PosterCard` instead of composing the title; `PosterCard` shows "Senza voto" when `rating` is explicitly `null` and prop `showNoRating` is true.
- [ ] **Step 6: Verify** typecheck + lint + browser at 390 px. **Commit** `feat(ui): home con hero della serie in corso`

---

### Task 7: Cerca

**Files:**
- Modify: `src/app/(app)/search/page.tsx`, `src/app/(app)/search/SearchClient.tsx`, `src/components/discover/DiscoverSections.tsx`
- Reference: `Search.dc.html`, `SearchResults.dc.html`

- [ ] **Step 1: page** — `TopBar title="Cerca"` (new style) then `SearchClient`.
- [ ] **Step 2: `SearchClient`** — sticky wrapper `sticky top-[calc(env(safe-area-inset-top,0px)+96px)] z-10 -mx-4 bg-bg px-5 pb-4`; row `flex items-center gap-3`; field wrapper `relative flex h-[52px] flex-1 items-center gap-2.5 rounded-full border border-white/10 bg-white/[0.08] px-[18px]` + `focus-within:border-accent focus-within:ring-4 focus-within:ring-accent/[0.16]`, lens SVG (`circle cx=11 cy=11 r=7` + `m21 21-4.35-4.35`, `text-muted`), input `flex-1 bg-transparent text-base outline-none placeholder:text-muted` placeholder "Film, serie TV…"; when `query` non-empty: clear button `size-[22px] rounded-full bg-white/[0.18]` with × (stroke black 3) and an "Annulla" text button (`text-base font-medium`) that clears and blurs. Results: `<p className="mb-3.5 text-[13px] text-muted">{n} risultati</p>` + grid `grid grid-cols-3 gap-4`. Loading skeleton grid unchanged but `rounded-[14px]`.
- [ ] **Step 3: `DiscoverSections`** — genre chips `h-9 rounded-full border border-white/[0.08] bg-surface-2 px-3.5 text-[13px] font-medium`; "Nuovi su streaming" cards pass `providers` (already available? if `discoverNewOnStreaming` results lack providers, leave without badges — do not add TMDB calls).
- [ ] **Step 4: Verify + Commit** `feat(ui): cerca con campo pillola e griglia risultati`

---

### Task 8: Amici

**Files:**
- Create: `src/components/social/FriendsStrip.tsx`, `src/components/social/InviteCard.tsx`
- Modify: `src/app/(app)/friends/{page,FeedList,RequestRow,UserSearch}.tsx`
- Reference: `Friends.dc.html`, `FriendsEmpty.dc.html`

- [ ] **Step 1: page** — `TopBar title="Amici" action={<NotificationsBell />}`; `UserSearch` field like the search field (h-12, lens icon, placeholder "Cerca utenti per username…"); "Richieste ricevute" header `flex items-center gap-2` with badge `min-w-[22px] h-[22px] rounded-full bg-accent px-[7px] text-xs font-bold`; `FriendsStrip` (`flex gap-3.5 overflow-x-auto scrollbar-none`, each `Link` to `/u/${username}` with `Avatar size={56}` + name `text-xs text-white/80`) under header "I tuoi amici" + count `text-sm text-muted`; then "Attività degli amici" + `FeedList`. Section gap 26 px, container `px-5`.
- [ ] **Step 2: `RequestRow`** — card `flex items-center gap-3 rounded-[20px] border border-border bg-surface px-3 py-2.5`; Accetta = `h-9 rounded-full bg-accent px-3.5 text-[13px] font-semibold text-white`; Rifiuta = `size-9 rounded-full border border-white/10 bg-white/[0.08]` with × icon and `aria-label="Rifiuta"`.
- [ ] **Step 3: `FeedList`** — row card `flex items-center gap-3 rounded-[20px] border border-border bg-surface px-3 py-2.5`, `Avatar size={38}`, text `text-sm leading-[1.4] text-white/[0.78]` with `<b className="font-semibold text-white">` around the user name and title (refactor `feedText` to return `ReactNode` segments: `{name, verb, title, extra}`; rating in `text-accent-soft font-semibold`), time under text `text-[11px] text-muted`, poster `h-[60px] w-10 rounded-lg` right. "Carica altri" → `Button variant="secondary"`.
- [ ] **Step 4: `InviteCard`** (client) — props `{ inviteUrl: string; username: string }`; stacked avatars (three gradient circles, `-ml-3` overlap), title "Non hai ancora amici su Zapp" `text-lg font-bold`, text (existing copy), link row `h-12 rounded-[14px] bg-surface-2 px-3.5 flex items-center justify-between` showing the URL in `text-[13px] text-accent-soft truncate` + copy icon button (`navigator.clipboard.writeText`, toast "Link copiato"); `Button` primary "Invita un amico" → `navigator.share?.({ url: inviteUrl, title: "Zapp" })` with fallback to copy. Page uses `InviteCard` when `friends.length === 0 && feed.items.length === 0`.
- [ ] **Step 5: Verify + Commit** `feat(ui): amici con fila avatar, feed e invito`

---

### Task 9: Libreria

**Files:**
- Modify: `src/app/(app)/library/page.tsx`, `src/app/(app)/library/LibraryGrid.tsx`
- Reference: `Library.dc.html`, `LibrarySheet.dc.html`

- [ ] **Step 1: page** — header row `flex items-baseline justify-between px-5 pt-[calc(env(safe-area-inset-top,0px)+40px)]`: title `text-[34px] font-bold tracking-[-0.045em]` + type segmented control (`flex gap-1 rounded-full border border-white/[0.08] bg-white/[0.08] p-[3px]`, each `Link` `h-7 rounded-full px-3 text-xs font-semibold` active `bg-white/[0.14] text-white` else `text-muted`). Status tabs: `flex gap-2 overflow-x-auto px-5 mt-4 scrollbar-none`, tab `h-[38px] shrink-0 rounded-full px-4 text-[13px] font-semibold` active `bg-accent text-white shadow-[0_6px_20px_rgba(139,92,246,0.35)]` else `border border-white/[0.08] bg-white/[0.06] text-muted`. Count `px-5 mt-3.5 text-[13px] text-muted` "{n} titoli" (singular "1 titolo").
- [ ] **Step 2: `LibraryGrid`** — grid `grid grid-cols-3 gap-4 px-5`; pass `rating` prop to `PosterCard`; dots button `absolute right-1.5 top-1.5 flex size-7 items-center justify-center rounded-full border border-white/[0.12] bg-black/55 backdrop-blur-md`. Sheet content: header `flex items-center gap-3.5 px-1` with poster 48×72 `rounded-[10px]`, title `text-lg font-bold tracking-[-0.02em]`, subtitle `text-[13px] text-muted` "{Serie|Film}, {anno}. In {stato} con ★ n" (omit rating part when null; status labels from `TABS`); actions in a group `rounded-[20px] border border-border bg-surface p-1 space-y-0.5`, each `Item` `flex h-[54px] w-full items-center gap-3.5 rounded-[14px] px-4 text-base font-medium` with a 20 px SVG icon in `text-accent-pale` (plus, play, check, ×), and a second group with the danger item (trash icon, `text-danger`). Requires `LibraryItem` to carry `year` (already) and `mediaType`.
- [ ] **Step 3: Verify + Commit** `feat(ui): libreria con tab pillola e sheet azioni`

---

### Task 10: Profilo + GenreBar + GENRE_COLORS

**Files:**
- Create: `src/lib/genre-colors.ts`, `src/components/profile/GenreBar.tsx`
- Modify: `src/app/(app)/profile/page.tsx`, `ProfileEditor.tsx`, `LogoutButton.tsx`
- Reference: `Profile.dc.html`, `ProfileFull.dc.html`, `gen-profile.mjs`

- [ ] **Step 1: `genre-colors.ts`**

```ts
/** Colore per genere TMDB (nome it-IT). Fallback grigio. */
export const GENRE_COLORS: Record<string, string> = {
  Azione: "#f43f5e",
  Avventura: "#10b981",
  Animazione: "#f472b6",
  Commedia: "#facc15",
  Crime: "#f97316",
  Documentario: "#a3a3a3",
  Dramma: "#3b82f6",
  Famiglia: "#fbbf24",
  Fantasy: "#8b5cf6",
  Storia: "#a16207",
  Horror: "#7f1d1d",
  Musica: "#d946ef",
  Mistero: "#6366f1",
  Romance: "#fb7185",
  Fantascienza: "#22d3ee",
  "Televisione film": "#64748b",
  Thriller: "#ef4444",
  Guerra: "#78716c",
  Western: "#b45309",
  // generi TV
  "Action & Adventure": "#f43f5e",
  Kids: "#fbbf24",
  News: "#a3a3a3",
  Reality: "#d946ef",
  "Sci-Fi & Fantasy": "#22d3ee",
  Soap: "#fb7185",
  Talk: "#64748b",
  "War & Politics": "#78716c",
};

export function genreColor(name: string): string {
  return GENRE_COLORS[name] ?? "#6e6e73";
}
```

- [ ] **Step 2: `GenreBar`** — props `{ items: { name: string; count: number }[]; total: number }`; bar `flex h-3.5 gap-[3px] overflow-hidden rounded-[7px]` with segments `style={{ flexGrow: count, flexBasis: 0, background: genreColor(name) }}`; legend `flex flex-wrap gap-x-4 gap-y-2` items `flex items-center gap-1.5 text-[13px]` (dot 8 px, name, percent `text-muted` = `Math.round(count / sumCounts * 100)`).
- [ ] **Step 3: page** — remove `TopBar`. Compute `watchedPosters = watched.map(e => e.title?.poster_path).filter(Boolean).slice(0, 16)`; if `< 8`, `await getWallPosters()`. Layout (mobile) per `Profile.dc.html`: wall (`height={470} opacity={0.75} speed="slow"`) + gradient + glow; top row (`absolute inset-x-5 top-[calc(env(safe-area-inset-top,0px)+40px)] flex justify-between`): "Modifica" glass pill (opens the edit sheet — move the `editOpen` trigger into `ProfileEditor` by exposing a `ProfileEditor` that renders `trigger` prop) and gear `GlassIconButton` (also opens the sheet). Identity block centered at `top-[122px]`: avatar 124 px with conic ring (`absolute -inset-1.5 rounded-full bg-[conic-gradient(from_200deg,#c4b5fd,#7c3aed,#2e1065,#8b5cf6,#c4b5fd)] opacity-90` + `absolute -inset-0.5 rounded-full bg-bg`) using `AvatarPicker size={124}` (badge included), name `text-[34px] font-extrabold tracking-[-0.05em]`, `@username` `text-[15px] text-white/55`, friends row (`Avatar size={22}` ×3 stacked from `getFriendsData()` + "{n} amici"). Stat block: `flex gap-5 px-5`: big `text-[76px] font-extrabold leading-[0.9] tracking-[-0.06em]` hours + `text-sm text-white/60` "ore di film e serie"; divider `w-px bg-white/10`; column with three `flex justify-between` rows (label `text-[13px] text-white/60`, value `text-xl font-bold tracking-[-0.03em]`). Genres: header "Generi più visti" + `text-xs text-muted` "su {watched.length} titoli", `GenreBar`. Top rated: cards `relative h-[225px] w-[150px] shrink-0 overflow-hidden rounded-[18px] shadow-[0_16px_40px_rgba(0,0,0,0.6)]` with poster `next/image fill`, bottom gradient, name `text-[13px] font-semibold` + rating `text-[30px] font-extrabold tracking-[-0.05em] text-accent-pale`. Settings group `rounded-[22px] border border-border bg-surface px-3.5 py-1` with rows h-14: privacy toggle (restyle checkbox as iOS switch: `relative h-[30px] w-[50px] rounded-full bg-white/[0.14] peer-checked:bg-accent` + knob), "Importa da Netflix" row (N box `size-[30px] rounded-lg bg-[#E50914] font-extrabold`, chevron), "Esci" centered `text-danger`. Footer unchanged. Desktop grid kept via `lg:` classes.
- [ ] **Step 4: `ProfileEditor`** — sheet form fields use the input classes from Task 4; `Button` primary "Salva". `LogoutButton` → plain `button.w-full h-14 text-[15px] font-medium text-danger`.
- [ ] **Step 5: Verify + browser check + Commit** `feat(ui): profilo con muro personale, statistica hero e barra generi`

---

### Task 11: Titolo

**Files:**
- Modify: `src/components/title/{TitleBody,TitleHeader,TitleActionsBar,TitleActions,WhereToWatch,ProviderButton,SeriesProgress,ProgressControls,FriendsWatching,TitleRating,TrailerButton,Overview,CastRow,SeasonList,RecommendationsShelf,TitleReviews,ReviewsClient}.tsx`
- Reference: `Title.dc.html`, `TitleFull.dc.html`, `gen-title.mjs`

- [ ] **Step 1: `TitleHeader`** — backdrop container `relative h-[440px] w-full overflow-hidden` (lg sizes kept), image `scale-110 origin-[50%_20%]`, gradient from mockup; top row: `BackButton` (left) and a share `GlassIconButton` (client, `navigator.share({ title, url: location.href })`, fallback copy) right at `top-[calc(env(safe-area-inset-top,0px)+40px)]`; poster row `absolute left-5 top-[296px] flex items-end gap-4` (mobile) — poster `h-[165px] w-[110px] rounded-[14px] border border-white/[0.08] shadow-[0_20px_50px_rgba(0,0,0,0.7)]`, title `text-[38px] font-extrabold leading-none tracking-[-0.05em]`, meta `text-[13px] text-white/70` "anno, n stagioni, n episodi" (use commas instead of `·`), genre chips `glass h-7 rounded-full px-[11px] text-xs font-medium`. Header total height 476 px on mobile so the body starts at `mt-4`.
- [ ] **Step 2: `SeriesProgress`/`ProgressControls`** — card `rounded-[20px] border border-border bg-surface px-[18px] py-4 flex flex-col gap-3`: row with `text-xs font-medium text-accent-soft` "Sei a" + `text-2xl font-extrabold tracking-[-0.04em]` "S{n} E{m}" and `text-[13px] text-muted` "{k} episodi rimasti"; bar `h-1.5 rounded-full bg-white/10` fill `bg-gradient-to-r from-accent-soft to-accent-strong`; footer row `text-xs text-muted` "Prossimo: S{n} E{m+1}" (compute with `nextEpisode` helper already used by `TitleActions`; if none, "Ultimo episodio") + "Segna progresso" (`text-accent-soft font-medium`) toggling the existing season/episode pickers below.
- [ ] **Step 3: `WhereToWatch`/`ProviderButton`** — section title `text-xl font-bold tracking-[-0.03em]`; `ProviderButton` card `flex items-center gap-3.5 rounded-[20px] border border-border bg-surface py-3 pl-3.5 pr-3`: logo `size-11 rounded-xl`, name `text-[15px] font-semibold`, sub `text-xs text-muted` ("Incluso nell'abbonamento" for flatrate, "A noleggio o acquisto" otherwise — add prop `kind`), CTA `h-10 rounded-full bg-accent px-[18px] text-sm font-semibold shadow-[var(--shadow-accent)] flex items-center gap-1.5` with play icon "Apri" (when `url` null: `glass` pill "Cerca"). `FriendsWatching` → row with stacked `Avatar size={22}` + "Guardato da <b>Elena</b> e <b>Marco</b>" (`text-[13px] text-white/70`, names `font-semibold text-white`; use ", " and " e " joins, "e altri n").
- [ ] **Step 4: `TitleRating` + `TrailerButton`** — one row `flex items-center justify-between px-5`: left `★` yellow 18 px + `text-[22px] font-bold tracking-[-0.03em]` `8,2` (format with `toLocaleString("it-IT", { maximumFractionDigits: 1 })`) + `text-[13px] text-muted` "/ 10, {votes} voti" + under `text-[10px] text-muted-2` "Voto TMDB"; right `TrailerButton` as `glass h-10 rounded-full px-4 text-sm font-semibold` with clapper icon "Trailer". Keep the TMDB attribution sentence in `TitleRating` (`text-[10px] text-muted-2`).
- [ ] **Step 5: `Overview`, `CastRow`, `SeasonList`, `RecommendationsShelf`** — titles `text-xl font-bold tracking-[-0.03em]`; overview `text-[15px] leading-[1.55] text-white/[0.78] text-pretty`; cast items `w-[84px]` with `size-[72px] rounded-full object-cover object-[50%_20%] border border-white/[0.08]` image, name `text-xs font-semibold`, role `text-[11px] text-muted`; season rows `rounded-[20px] border border-border bg-surface py-2.5 pl-2.5 pr-3.5 flex items-center gap-3` with poster `h-[66px] w-11 rounded-lg`, name `text-[15px] font-semibold`, meta `text-xs text-muted` "{n} episodi, {anno}", right slot: completed → `size-6 rounded-full bg-accent/20` with check `text-accent-pale`; in progress → `text-xs font-semibold text-accent-soft` "{k} / {n}"; else chevron `text-muted`. `SeasonList` needs `watchedSeason/watchedEpisode` → pass from `TitleBody` (read the user's entry once in `TitleBody`, it is already fetched in `SeriesProgress`; lift that query into `TitleBody` and pass down).
- [ ] **Step 6: `TitleReviews`/`ReviewsClient`** — header row "Recensioni" + `text-[13px] text-muted` "Voto Zapp <b class=text-accent-soft>8,7</b> su n voti" (from `title_rating_stats`); prompt card `rounded-[20px] border border-border bg-surface px-3.5 py-3 flex items-center justify-between`: "Cosa ne pensi?" `text-sm text-white/70` + 5 star outlines (`text-muted`), tapping opens the existing rating/review form; review card: `Avatar size={32}`, name `text-sm font-semibold`, time `text-[11px] text-muted`, rating `text-sm font-bold text-accent-soft`, text `text-sm leading-[1.5] text-white/80`, footer `text-xs text-muted` likes + comments count. Keep all existing behaviors (spoiler, like, report, comments).
- [ ] **Step 7: `TitleActionsBar`** — bar `fixed inset-x-4 z-30 mx-auto flex max-w-[448px] gap-2` at `bottom: calc(env(safe-area-inset-bottom) + 22px)` with the 150 px black gradient behind (`pointer-events-none fixed inset-x-0 bottom-0 h-[150px] bg-gradient-to-b from-transparent via-black/90 to-black`); primary action `flex-1 h-14 rounded-full bg-accent text-[15px] font-semibold shadow-[0_10px_30px_rgba(139,92,246,0.45)] flex items-center justify-center gap-2` (label = current primary label: "Voglio vederlo" / "Inizia" / "Prossimo episodio" / "Finito" / "Riprendi" / "Rivedi" as today), secondary circles `size-14 rounded-full border border-white/[0.12] bg-[rgba(28,28,30,0.85)] backdrop-blur-xl` for "Vota" (star outline) and "Altre azioni" (dots) with `aria-label`s; `FloatingNav` is hidden on title pages? No — keep nav hidden on `/title/*` by rendering `FloatingNav` with `hidden` when `pathname.startsWith("/title/")` (edit `FloatingNav`), since the action bar takes its place (matches mockup).
- [ ] **Step 8: Verify** typecheck + lint + browser check on a TV title in `watching` and a movie. **Commit** `feat(ui): scheda titolo con testata, progresso e barra azioni`

---

### Task 12: Stagione, Notifiche, Import Netflix, Profilo pubblico

**Files:**
- Modify: `src/app/(app)/title/tv/[id]/season/[n]/page.tsx`, `src/components/title/EpisodeRow.tsx`, `src/app/(app)/notifications/page.tsx`, `src/app/(app)/import/netflix/ImportClient.tsx`, `src/app/(app)/u/[username]/page.tsx`, `src/components/social/FriendButton.tsx`
- Reference: `Season.dc.html`, `Notifications.dc.html`, `ImportNetflix.dc.html`, `ImportReview.dc.html`, `PublicProfile.dc.html`, `gen-extra.mjs`

- [ ] **Step 1: Season** — header `relative h-[300px] overflow-hidden`: season poster (`posterUrl(season.poster_path, "w342")`) `next/image fill` with `blur-[24px] scale-[1.3] opacity-60 object-[50%_30%]` + gradient; row at `top-[calc(env(safe-area-inset-top,0px)+40px)]`: `BackButton` inline (not absolute) + column (series link `text-[13px] font-medium text-accent-soft`, "Stagione n" `text-[26px] font-bold tracking-[-0.04em]`); under: `flex justify-between px-5` "{n} episodi, {anno}" `text-[13px] text-muted` and progress (`w-[90px] h-1 bg-white/[0.12]` bar + "k / n" `text-[13px] font-medium text-accent-pale`) where k = episodes watched in this season (0 if none, n if a later season is in progress/finished). List `mt-4 space-y-2 px-5`. `EpisodeRow`: card `rounded-[20px] border border-border bg-surface p-2.5 flex gap-3`, still `h-[66px] w-[118px] rounded-[10px]` with overlay check when watched (card `opacity-55`), `isNext` prop (first unwatched after the watched one) → `border-accent/55 ring-[3px] ring-accent/[0.14]` + badge `absolute left-1.5 top-1.5 h-5 rounded-full bg-accent px-2 text-[10px] font-bold` "Prossimo"; title `text-sm font-semibold` with number `text-muted`; meta "{min} min, {data}" `text-xs text-muted`; keep the "Trama" `details`.
- [ ] **Step 2: Notifications** — `BackButton` inline + title; group `items` into `nuove` (`unread`) and `precedenti`; group label `text-xs font-semibold px-1` (`text-accent-soft` for Nuove, `text-muted` for Precedenti); card `flex items-center gap-3 rounded-[20px] border border-border bg-surface px-3.5 py-3` + unread `bg-[#121218] border-accent/25`; left: `Avatar size={40}` of the sender (extend the profile select to include `avatar_url`) with a `size-6 rounded-full bg-surface border-2 border-bg` badge holding a 16 px kind icon (`friend_request` user-plus, `friend_accepted` user-check, `recommendation` star, `comment` bubble) in `text-accent-pale`; text `text-sm leading-[1.35]` with `<b className="font-semibold">` name (and title when `payload.title_id` — fetch title names via one `titles` select `in` on the payload ids, `title` + `poster_path`); time relative (`timeAgo` from `FeedList` → move it to `src/lib/format.ts` and import in both) `text-[11px] text-muted`; right: poster `h-[51px] w-[34px] rounded-[7px]` when a title exists, else unread dot `size-2 rounded-full bg-accent`. Empty state unchanged.
- [ ] **Step 3: ImportClient** — intro: `BackButton` + title "Importa da Netflix" `text-[28px]`; row with N box `size-14 rounded-2xl bg-[#E50914] text-3xl font-extrabold shadow-[0_12px_30px_rgba(229,9,20,0.35)]` + `text-[15px] text-white/80` "Porta in Zapp tutto quello che hai già visto. Ci vuole un minuto."; steps card `rounded-[20px] border border-border bg-surface p-[18px] space-y-3.5` with numbered circles `size-6 rounded-full bg-accent/[0.18] text-xs font-bold text-accent-pale` and the three existing instruction lines (bold the menu names); drop zone `rounded-[22px] border-[1.5px] border-dashed border-accent/50 bg-accent/[0.06] flex flex-col items-center gap-2.5 px-5 py-7` (icon box 52 px `bg-accent/[0.18]`, "Trascina qui il CSV" `text-[15px] font-semibold`, "max 5MB" `text-xs text-muted`); accept drag & drop (`onDrop` → same handler as the file input); `Button` primary "Scegli il file CSV"; note `text-xs text-muted text-center`. Review: big count `text-[44px] font-extrabold tracking-[-0.05em]` + `text-[15px] text-white/70` "titoli riconosciuti su {total}"; rows `rounded-[20px] border border-border bg-surface py-2 pl-2 pr-3 flex items-center gap-3` with checkbox visual `size-6 rounded-lg` (`bg-accent` + white check when included, `border-[1.5px] border-white/25` otherwise; keep the real `<input type=checkbox>` visually hidden for a11y), poster `h-[54px] w-9 rounded-[7px]`, title `text-sm font-semibold truncate`, meta "Serie, fino a S{n}E{m}" / "Film" `text-xs text-muted`; "Non riconosciuti (n)" label `text-[13px] font-semibold text-muted px-1`; unmatched rows with `glass h-[34px] rounded-full px-3 text-xs font-semibold` "Cerca a mano"; submit as fixed bottom `Button` primary full width over a black gradient (same pattern as Task 11 step 7) "Importa {n} titoli". Result view: keep, restyle text sizes (`text-xl font-bold`).
- [ ] **Step 4: Public profile** — remove `TopBar`; header `relative h-[320px] overflow-hidden` with backdrop = first `watching` poster (or first `watched`) via `next/image fill` `blur-[30px] saturate-[1.2] scale-[1.4] opacity-50 object-[50%_20%]` + gradient; top row: `BackButton` inline + `GlassIconButton` "…" (opens the existing block action if present in `FriendButton`, else omit); identity centered at `top-[118px]`: `Avatar size={104}` with shadow, name `text-[30px] font-extrabold tracking-[-0.05em]`, `@username` `text-sm text-white/55`; buttons row: `FriendButton` restyled by state — friends: `h-10 rounded-full border border-accent/45 bg-accent/[0.18] px-[18px] text-sm font-semibold text-accent-pale` with check "Amici"; none: `bg-accent text-white` "Aggiungi"; outgoing: `glass` "Richiesta inviata"; incoming: `bg-accent` "Accetta"; plus a `glass` "Consiglia" pill opening `RecommendSheet` (only when friends; needs a client wrapper since the page is a Server Component — add `src/components/social/RecommendToUserButton.tsx` reusing `RecommendSheet` if its props allow choosing a title; if `RecommendSheet` is title-scoped, hide this button and note it); counters row `flex gap-6 text-[13px] text-white/60` "<b>{watched.length}</b> visti", "<b>{watching.length}</b> in corso" (friend count omitted if not available without extra queries). Shelves as today with the new `HorizontalShelf` and `rating` prop. Private card → `rounded-[20px] border border-border bg-surface p-6 text-center`.
- [ ] **Step 5: Verify + Commit** `feat(ui): stagione, notifiche, import Netflix e profilo pubblico`

---

### Task 13: Final verification and cleanup

- [ ] **Step 1:** `grep -rn "pb-28\|rounded-xl border border-border bg-surface\|text-accent\b" src` — replace leftovers of the old vocabulary where a mockup exists; leave desktop-only code.
- [ ] **Step 2:** `pnpm typecheck && pnpm lint && pnpm build` → all green (paste output in the final report).
- [ ] **Step 3:** Browser pass at 390 px width: `/login`, `/onboarding` (with a fresh test account or by temporarily visiting while `onboarding_completed_at` is null), `/`, `/search`, `/friends`, `/library`, `/profile`, one TV title, one season, `/notifications`, `/import/netflix`, one `/u/<username>`. Check: no horizontal scroll, nav pill not overlapping content, wall loops without gaps, reduced-motion stops the wall (DevTools rendering emulation).
- [ ] **Step 4:** Update `CLAUDE.md` "Conventions": tokens list, `.glass` utilities, `PosterWall` data source, `FloatingNav` vs `BottomNav`, mockups path.
- [ ] **Step 5: Commit** `docs: convenzioni UI redesign Cinema`
