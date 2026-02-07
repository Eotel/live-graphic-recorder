import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { toAppLanguage } from "@/i18n/config";

interface LanguageToggleProps {
  className?: string;
}

const LANGUAGES = [
  { code: "ja", labelKey: "common.languageJa" },
  { code: "en", labelKey: "common.languageEn" },
] as const;

export function LanguageToggle({ className }: LanguageToggleProps) {
  const { t, i18n } = useTranslation();
  const currentLanguage = toAppLanguage(i18n.resolvedLanguage ?? i18n.language);

  return (
    <div
      role="group"
      aria-label={t("common.language")}
      className={cn("inline-flex rounded-md border border-border bg-background p-0.5", className)}
    >
      {LANGUAGES.map((language) => {
        const isActive = currentLanguage === language.code;
        return (
          <button
            key={language.code}
            type="button"
            onClick={() => {
              void i18n.changeLanguage(language.code);
            }}
            className={cn(
              "rounded-sm px-2 py-1 text-xs font-medium transition-colors",
              isActive
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
            aria-pressed={isActive}
            title={t(language.labelKey)}
          >
            {language.code.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}

export default LanguageToggle;
