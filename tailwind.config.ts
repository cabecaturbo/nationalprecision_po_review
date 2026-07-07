import type { Config } from "tailwindcss";

// Tailwind is wired into the project per the build spec. The UI itself is
// ported verbatim with the component's original inline styles for pixel-exact
// fidelity, so the NPB blue is also exposed here as a token for anything added
// later (utility classes, new screens) that should stay on-brand.
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        npb: {
          DEFAULT: "#004b8d", // corporate blue
          dark: "#00335f",
        },
      },
    },
  },
  plugins: [],
};

export default config;
