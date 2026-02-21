# Typography & Fonts

TierBoard uses a comprehensive font system from Fontsource, providing a wide range of typefaces for different use cases.

## Available Fonts

All fonts are available via `@fontsource` packages and can be imported as needed.

### Sans-serif

```bash
@fontsource-variable/inter           # The standard, timeless
@fontsource-variable/plus-jakarta-sans  # Geometric, modern app UI
@fontsource-variable/dm-sans         # Clean, low-contrast, Google-commissioned
```

### Serif

```bash
@fontsource-variable/lora            # Warm editorial serif, web-native
@fontsource/playfair-display         # High contrast, magazine feel
@fontsource-variable/source-serif-4  # Adobe's workhorse, very readable
```

### Monospace

```bash
@fontsource-variable/jetbrains-mono  # Best coding mono, ligatures
@fontsource/geist-mono               # Vercel's mono, crisp at small sizes
@fontsource-variable/fira-code       # Ligature-heavy, popular in devtools
```

### Display

```bash
@fontsource-variable/syne            # Geometric, festival-born, distinctive
@fontsource/space-grotesk            # Techy with character, great for headers
```

### Brutalist

```bash
@fontsource-variable/darker-grotesque  # Edgy neo-grotesque, structured
@fontsource/work-sans                  # Weight 900 is brutalist gold
```

### Slab

```bash
@fontsource-variable/roboto-slab     # Safe, readable, Google-quality
@fontsource-variable/montagu-slab    # Sophisticated, high-end editorial
@fontsource-variable/hepta-slab      # Heavy display slab, very bold
```

### Futuristic

```bash
@fontsource/orbitron                 # The sci-fi font, space/gaming UI
@fontsource-variable/exo-2           # Clean futurism, readable at body size
@fontsource/audiowide                # Wide, techy, Twitch/game-adjacent
```

## Recommended Pairings

For TierBoard specifically, these pairings work well:

- **UI labels/body**: Inter or DM Sans
- **Tier headers**: Space Grotesk or Syne (bold)
- **Room codes**: Geist Mono or JetBrains Mono

## Usage

To use any of these fonts, import them in your component:

```typescript
import '@fontsource-variable/inter';
import '@fontsource/space-grotesk';

// Then apply in your CSS/JSX
<h1 className="font-['Inter']">My Tier List</h1>
<p className="font-['Space_Grotesk']">S Tier</p>
```

## Font Weights

Variable fonts (marked with `@fontsource-variable/`) support a continuous range of weights. Non-variable fonts have specific weights available.

## Performance

All fonts are self-hosted via Fontsource and loaded efficiently. Variable fonts help reduce the number of HTTP requests while providing flexibility.
