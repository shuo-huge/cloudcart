import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import "@cloudcart/ui/styles.css";
import "./admin.css";
import { adminGet } from "./api";
import { Toaster } from "./components";
import { I18nProvider, TranslationOverlay } from "./i18n";
import { LoginPage } from "./pages/Login";
import { Routes } from "./Routes";
import { Shell } from "./Shell";
import type { Admin } from "./types";

function App() {
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [checking, setChecking] = useState(true);

  async function loadSession() {
    try {
      const result = await adminGet<{ admin: Admin }>("/me");
      setAdmin(result.admin);
    } catch {
      setAdmin(null);
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    void loadSession();
    const onExpired = () => setAdmin(null);
    window.addEventListener("cloudcart:auth-expired", onExpired);
    return () => window.removeEventListener("cloudcart:auth-expired", onExpired);
  }, []);

  if (checking) {
    return (
      <>
        <div class="boot-screen">Loading CloudCart…</div>
        <TranslationOverlay />
      </>
    );
  }

  return (
    <>
      {admin ? (
        <Shell admin={admin} onLogout={() => setAdmin(null)}>
          <Routes />
        </Shell>
      ) : (
        <LoginPage onAuthenticated={(next) => {
          setAdmin(next);
          if (window.location.pathname === "/admin/login" || window.location.pathname === "/admin/setup") {
            window.history.replaceState({}, "", "/admin");
            window.dispatchEvent(new CustomEvent("cloudcart:navigate"));
          }
        }} />
      )}
      <TranslationOverlay />
      <Toaster />
    </>
  );
}

render(<I18nProvider><App /></I18nProvider>, document.getElementById("app")!);
