/** @type {import('tailwindcss').Config} */

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    container: {
      center: true,
    },
    extend: {
      colors: {
        abyss: {
          50: "#f0f4fa",
          100: "#dae2ef",
          200: "#a8b9d4",
          300: "#7089b0",
          400: "#3f5781",
          500: "#1e2e4d",
          600: "#15213a",
          700: "#0f172a",
          800: "#0a0f1d",
          900: "#060912",
        },
        amberx: {
          400: "#fbbf24",
          500: "#f59e0b",
          600: "#d97706",
        },
        emeraldx: {
          400: "#34d399",
          500: "#10b981",
          600: "#059669",
        },
        coral: {
          400: "#f87171",
          500: "#ef4444",
          600: "#dc2626",
        },
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', '"Fira Code"', "Consolas", "monospace"],
        sans: ['"Noto Sans SC"', '"Source Han Sans"', "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
      },
      boxShadow: {
        glow: "0 0 20px rgba(245, 158, 11, 0.35)",
        "glow-sm": "0 0 10px rgba(245, 158, 11, 0.25)",
        "glow-emerald": "0 0 20px rgba(16, 185, 129, 0.35)",
        "glow-red": "0 0 20px rgba(239, 68, 68, 0.35)",
        "glass": "0 8px 32px rgba(0, 0, 0, 0.37)",
      },
      backdropBlur: {
        xs: "2px",
      },
      keyframes: {
        pulseRed: {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(239,68,68,0.7)" },
          "50%": { boxShadow: "0 0 0 10px rgba(239,68,68,0)" },
        },
        slideDown: {
          "0%": { transform: "translateY(-100%)", opacity: "0" },
          "10%": { transform: "translateY(0)", opacity: "1" },
          "90%": { transform: "translateY(0)", opacity: "1" },
          "100%": { transform: "translateY(-100%)", opacity: "0" },
        },
        slideInRight: {
          "0%": { transform: "translateX(100%)", opacity: "0" },
          "100%": { transform: "translateX(0)", opacity: "1" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-400px 0" },
          "100%": { backgroundPosition: "400px 0" },
        },
      },
      animation: {
        pulseRed: "pulseRed 1.5s ease-in-out infinite",
        slideDown: "slideDown 3.5s ease-in-out forwards",
        slideInRight: "slideInRight 0.3s ease-out",
        shimmer: "shimmer 2s linear infinite",
      },
    },
  },
  plugins: [],
};
