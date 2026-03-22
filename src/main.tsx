import { createRoot } from "react-dom/client";
import "./index.css";

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

if (!url || !key) {
  import("./pages/MissingConfigPage").then(({ default: MissingConfigPage }) => {
    createRoot(document.getElementById("root")!).render(<MissingConfigPage />);
  });
} else {
  import("./App").then(({ default: App }) => {
    createRoot(document.getElementById("root")!).render(<App />);
  });
}
