# LogLens AI — Dark Theme Branding (Tailwind + shadcn drop-in)
This document is the **single source of truth** for LogLens AI UI branding (colors, typography, component rules).

**Design intent:** enterprise/SRE “mission control” dashboard — high clarity, low glare, strong hierarchy.

---

## 1) Brand tokens
### Core palette (hex reference)
**Surfaces**
- Background: `#0B0F14`
- Surface 1 (cards): `#0F1620`
- Surface 2 (nested): `#141F2B`
- Surface 3 (hover/active): `#18263A`
- Border/Divider: `#223244`

**Typography**
- Text primary: `#EAF0F7`
- Text secondary: `#B6C2D0`
- Text muted: `#8FA1B3`

**Accents**
- Primary (Signal Cyan): `#22D3EE`
- Secondary (Electric Violet): `#8B5CF6` *(optional)*

**Status**
- Info: `#38BDF8`
- Success: `#22C55E`
- Warning: `#F59E0B`
- Error: `#EF4444`
- Critical: `#F43F5E`

---

## 2) Drop-in implementation (Next.js + Tailwind + shadcn)
> Use CSS variables in `globals.css`, then map Tailwind colors to those variables in `tailwind.config.ts`.  
> This matches standard shadcn theming patterns.

### 2.1 `app/globals.css` (or `src/app/globals.css`)
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

/* LogLens AI Theme */
@layer base {
  :root {
    --background: 220 25% 6%;          /* #0B0F14 */
    --foreground: 210 45% 95%;         /* #EAF0F7 */

    --card: 216 33% 9%;                /* #0F1620 */
    --card-foreground: 210 45% 95%;

    --popover: 216 33% 9%;
    --popover-foreground: 210 45% 95%;

    --primary: 190 95% 55%;            /* #22D3EE */
    --primary-foreground: 222 47% 11%;

    --secondary: 215 25% 14%;          /* #141F2B */
    --secondary-foreground: 210 30% 85%; /* #B6C2D0 */

    --muted: 214 28% 16%;              /* #18263A-ish */
    --muted-foreground: 212 18% 62%;   /* #8FA1B3 */

    --accent: 215 25% 14%;
    --accent-foreground: 210 45% 95%;

    --destructive: 0 84% 60%;          /* #EF4444 */
    --destructive-foreground: 210 45% 95%;

    --border: 215 26% 20%;             /* #223244 */
    --input: 215 26% 20%;
    --ring: 190 95% 55%;

    --radius: 1rem;                    /* 16px (2xl feel) */

    /* Optional: dashboard status + charts */
    --success: 142 71% 45%;            /* #22C55E */
    --warning: 38 92% 50%;             /* #F59E0B */
    --info: 199 89% 57%;               /* #38BDF8 */
    --critical: 346 87% 56%;           /* #F43F5E */
    --violet: 255 92% 67%;             /* #8B5CF6 */
  }

  /* If you use `next-themes`, `.dark` will be toggled.
     If you want always-dark, set <html class="dark"> (see 2.3). */
  .dark {
    --background: 220 25% 6%;
    --foreground: 210 45% 95%;
    --card: 216 33% 9%;
    --card-foreground: 210 45% 95%;
    --popover: 216 33% 9%;
    --popover-foreground: 210 45% 95%;
    --primary: 190 95% 55%;
    --primary-foreground: 222 47% 11%;
    --secondary: 215 25% 14%;
    --secondary-foreground: 210 30% 85%;
    --muted: 214 28% 16%;
    --muted-foreground: 212 18% 62%;
    --accent: 215 25% 14%;
    --accent-foreground: 210 45% 95%;
    --destructive: 0 84% 60%;
    --destructive-foreground: 210 45% 95%;
    --border: 215 26% 20%;
    --input: 215 26% 20%;
    --ring: 190 95% 55%;
    --radius: 1rem;

    --success: 142 71% 45%;
    --warning: 38 92% 50%;
    --info: 199 89% 57%;
    --critical: 346 87% 56%;
    --violet: 255 92% 67%;
  }

  body {
    @apply bg-background text-foreground;
  }
}
```

### 2.2 `tailwind.config.ts`
```ts
import type { Config } from "tailwindcss"

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",

        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },

        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },

        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",

        /* Optional status tokens */
        success: "hsl(var(--success))",
        warning: "hsl(var(--warning))",
        info: "hsl(var(--info))",
        critical: "hsl(var(--critical))",
        violet: "hsl(var(--violet))",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}

export default config
```

### 2.3 Force “always dark” (recommended for LogLens)
In `app/layout.tsx`:
```tsx
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  )
}
```

If you prefer user-toggle, use `next-themes` and remove the hardcoded `className="dark"`.

---

## 3) Component styling rules (shadcn-friendly)
### Tables (most important)
- Sticky header, subtle border: `border-border`
- Row hover: `bg-muted/40` or `bg-[hsl(var(--muted))]/40`
- Severity badges: use status tokens (`critical`, `error`, `warning`, `info`, `success`)
- Font size: `text-sm` (13–14px) for dense dashboards

### Cards
- Use `bg-card` + `border border-border`
- Radius: `rounded-2xl` (aligns with `--radius: 1rem`)
- Keep shadows subtle: `shadow-sm`

### Log viewer
- Monospace + line numbers
- Highlight matches with `bg-primary/15`
- Use `text-muted-foreground` for metadata (timestamp, service)

---

## 4) Where to reference this in your docs
Add to **MVP**:
- “UI Theme: see `markdowns/branding.md` (Tailwind + shadcn tokens).”

Add to **Development Plan** (UI section):
- `[ ] Apply LogLens theme tokens (globals.css + tailwind.config + dark root class)`

---

## 5) Quick sanity checklist
- [ ] Background is near-black (not pure black)
- [ ] Tables are readable at `text-sm`
- [ ] Borders are visible but subtle
- [ ] Primary action button is Signal Cyan
- [ ] Severity colors are consistent across charts + badges
- [ ] No secrets/PII displayed in log samples by default
