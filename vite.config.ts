import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const fileEnv = loadEnv(mode, process.cwd(), "");
  const metaAppId =
    fileEnv.META_APP_ID ||
    fileEnv.VITE_META_APP_ID ||
    process.env.META_APP_ID ||
    process.env.VITE_META_APP_ID ||
    "";

  return {
    server: {
      host: "::",
      port: 8080,
      hmr: {
        overlay: false,
      },
    },
    plugins: [react()],
    define: {
      "import.meta.env.META_APP_ID": JSON.stringify(metaAppId),
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
      dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
    },
  };
});
