import { Database, Gauge, ShieldCheck, UserRound, type LucideIcon } from "lucide-react";

export interface SettingsSectionLink {
  id: string;
  label: string;
  icon: LucideIcon;
}

/** Sections of the Réglages page, in order (ids are the anchors). */
export const SETTINGS_SECTIONS: SettingsSectionLink[] = [
  { id: "profil", label: "Profil créateur", icon: UserRound },
  { id: "sources", label: "Sources de données", icon: Database },
  { id: "score", label: "Calcul du score", icon: Gauge },
  { id: "confidentialite", label: "Données et confidentialité", icon: ShieldCheck },
];

/**
 * In-page navigation: a horizontal row of chips on phones, a sticky
 * sidebar from `lg`. Plain anchors (work without JavaScript).
 */
export function SettingsNav() {
  return (
    <nav
      aria-label="Sections des réglages"
      className="-mx-4 mb-8 overflow-x-auto px-4 scrollbar-none sm:-mx-6 sm:px-6 lg:sticky lg:top-24 lg:mx-0 lg:mb-0 lg:self-start lg:overflow-visible lg:px-0"
    >
      <ul className="flex gap-2 lg:flex-col lg:gap-0.5">
        {SETTINGS_SECTIONS.map((section) => {
          const Icon = section.icon;
          return (
            <li key={section.id} className="shrink-0">
              <a
                href={`#${section.id}`}
                className="inline-flex h-9 items-center gap-2 whitespace-nowrap rounded-full border border-line bg-surface px-3.5 text-[0.8125rem] font-medium text-muted shadow-xs transition-colors duration-150 hover:border-line-strong hover:text-ink lg:flex lg:w-full lg:rounded-lg lg:border-transparent lg:bg-transparent lg:px-3 lg:shadow-none lg:hover:border-transparent lg:hover:bg-surface-2"
              >
                <Icon aria-hidden className="size-4 text-faint" />
                {section.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
