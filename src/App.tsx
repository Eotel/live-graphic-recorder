import "./index.css";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import { AppShell } from "@/app/container/AppShell";
import { toAppLanguage } from "@/i18n/config";

export function App() {
  const { i18n } = useTranslation();

  useEffect(() => {
    document.documentElement.lang = toAppLanguage(i18n.resolvedLanguage ?? i18n.language);
  }, [i18n.language, i18n.resolvedLanguage]);

  return <AppShell />;
}

export default App;
