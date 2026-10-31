import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        palm: { 950: "#0A1B15", 900: "#0F2A22", 800: "#173A30", 700: "#21503F", 600: "#2F6B55", 500: "#3F8A6E" },
        gold: { 50: "#FFF9E0", 200: "#FBE38A", 300: "#F5CF4F", 400: "#E8B923", 500: "#C99A12", 600: "#9E7609" },
        paper: { 50: "#F6F7F4", 100: "#EEF0EB", 200: "#E2E6DE", 300: "#D2D8CD" },
        ink: { 900: "#14201B", 800: "#2A3631", 600: "#55615B" },
        chili: { 50: "#FDF0ED", 500: "#C8381F", 600: "#A82C17" },
        leaf: { 50: "#EAF6EE", 500: "#2F8F4E", 700: "#1F6B38" },
      },
      fontFamily: {
        sans: ["var(--font-body)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
