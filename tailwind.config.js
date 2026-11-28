/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class", '[data-theme="dark"]'],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  corePlugins: { preflight: false },
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        surface: {
          0: "var(--surface-0)",
          1: "var(--surface-1)",
          2: "var(--surface-2)",
          3: "var(--surface-3)",
          4: "var(--surface-4)",
        },
        ink: {
          DEFAULT: "var(--text)",
          2: "var(--text-2)",
          3: "var(--text-3)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          2: "var(--accent-2)",
        },
        line: "var(--border)",
        danger: "var(--danger)",
        success: "var(--success)",
      },
      borderRadius: {
        xl2: "16px",
        xl3: "20px",
      },
      fontFamily: {
        sans: ["Inter", "var(--font-body)"],
        display: ["Inter", "var(--font-display)"],
      },
      boxShadow: {
        glow: "var(--glow)",
        lift: "var(--shadow-lg)",
      },
    },
  },
  plugins: [],
};
