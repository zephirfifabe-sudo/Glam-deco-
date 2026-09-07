import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#fdf5f3",
          100: "#fbe8e3",
          200: "#f6cdc2",
          300: "#eda892",
          400: "#e07a5f",
          500: "#cc5a3d",
          600: "#ab4530",
          700: "#8c3728",
          800: "#742f24",
          900: "#622b22",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        serif: ["var(--font-serif)", "Georgia", "serif"],
      },
    },
  },
  plugins: [],
};

export default config;
