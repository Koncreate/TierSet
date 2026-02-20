// Locale switcher refs:
// - Paraglide docs: https://inlang.com/m/gerre34r/library-inlang-paraglideJs
// - Router example: https://github.com/TanStack/router/tree/main/examples/react/i18n-paraglide#switching-locale
import { getLocale, locales, setLocale } from "#/paraglide/runtime";
import { m } from "#/paraglide/messages";
import { useEffect, useState } from "react";

export default function ParaglideLocaleSwitcher() {
  // Use state to avoid hydration mismatch - locale is only read on client
  const [currentLocale, setCurrentLocale] = useState<string>("en");

  useEffect(() => {
    setCurrentLocale(getLocale());
  }, []);

  return (
    <div
      style={{
        display: "flex",
        gap: "0.5rem",
        alignItems: "center",
        color: "inherit",
      }}
      aria-label="Language"
    >
      <span style={{ opacity: 0.85 }}>Current locale: {currentLocale}</span>
      <div style={{ display: "flex", gap: "0.25rem" }}>
        {locales.map((locale) => (
          <button
            key={locale}
            onClick={() => setLocale(locale)}
            aria-pressed={locale === currentLocale}
            style={{
              cursor: "pointer",
              padding: "0.35rem 0.75rem",
              borderRadius: "999px",
              border: "1px solid #d1d5db",
              background: locale === currentLocale ? "#0f172a" : "transparent",
              color: locale === currentLocale ? "#f8fafc" : "inherit",
              fontWeight: locale === currentLocale ? 700 : 500,
              letterSpacing: "0.01em",
            }}
          >
            {locale.toUpperCase()}
          </button>
        ))}
      </div>
    </div>
  );
}
