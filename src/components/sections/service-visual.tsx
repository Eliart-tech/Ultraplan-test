import { LogoMark } from "@/components/layout/logo";

/**
 * The illustrated panel at the top of each service card. Everything is drawn in
 * markup — no image assets to host, and it stays crisp at every size.
 */

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div
      aria-hidden
      className="grid-faint relative flex h-56 items-center justify-center overflow-hidden rounded-3xl bg-sky-100 px-6"
    >
      {children}
    </div>
  );
}

function Chip({ label }: { label: string }) {
  return (
    <span className="rounded-full bg-white px-3.5 py-1.5 text-xs text-ink-800 shadow-[0_2px_10px_rgba(37,48,102,0.08)]">
      {label}
    </span>
  );
}

function SearchBar({ caption }: { caption: string }) {
  return (
    <div className="mt-4 flex items-center gap-2.5 rounded-full bg-white px-2 py-2 shadow-[0_2px_10px_rgba(37,48,102,0.08)]">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-sky-300">
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 text-ink-800" fill="none">
          <circle cx="7" cy="7" r="4.4" stroke="currentColor" strokeWidth="1.5" />
          <path d="m10.4 10.4 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </span>
      <span className="truncate text-xs text-ink-500">{caption}</span>
    </div>
  );
}

export function ServiceVisual({
  variant,
  title,
  items,
  caption,
}: {
  variant: "connect" | "flow" | "report" | "training";
  title: string;
  items?: readonly string[];
  caption?: string;
}) {
  if (variant === "connect") {
    return (
      <Panel>
        <div className="w-full max-w-xs rounded-2xl bg-white p-5 shadow-[0_10px_30px_-18px_rgba(37,48,102,0.5)]">
          <p className="text-xs text-ink-400">{title}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {items?.map((item) => (
              <Chip key={item} label={item} />
            ))}
          </div>
          <div className="mt-4 flex items-center gap-2.5 border-t border-line pt-4">
            <LogoMark className="h-7 w-7" />
            <span className="h-2 flex-1 rounded-full bg-sky-200" />
            <span className="h-2 w-8 rounded-full bg-blush-300" />
          </div>
        </div>
      </Panel>
    );
  }

  if (variant === "flow") {
    return (
      <Panel>
        <div className="w-full max-w-xs rounded-2xl bg-white p-5 shadow-[0_10px_30px_-18px_rgba(37,48,102,0.5)]">
          <p className="text-xs text-ink-400">{title}</p>
          <ol className="mt-3 flex flex-col gap-2">
            {items?.map((item, i) => (
              <li key={item} className="flex items-center gap-2.5">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-sky-200 text-[0.6rem] text-ink-800">
                  {i + 1}
                </span>
                <span className="text-xs text-ink-500">{item}</span>
                <span className="ml-auto h-1.5 w-8 rounded-full bg-sky-100" />
              </li>
            ))}
          </ol>
        </div>
      </Panel>
    );
  }

  if (variant === "report") {
    return (
      <Panel>
        <div className="w-full max-w-xs rounded-2xl bg-white p-5 shadow-[0_10px_30px_-18px_rgba(37,48,102,0.5)]">
          <p className="flex items-center gap-2 text-xs text-ink-400">
            <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />
            {title}
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {[0, 1].map((i) => (
              <span
                key={i}
                className="flex h-14 flex-col justify-center gap-1 rounded-lg bg-sky-100 px-2"
              >
                <span className="h-1 w-full rounded-full bg-white" />
                <span className="h-1 w-3/4 rounded-full bg-white" />
                <span className="h-1 w-5/6 rounded-full bg-white" />
              </span>
            ))}
            <span className="grid h-14 place-items-center rounded-lg bg-sky-200">
              <LogoMark className="h-6 w-6" />
            </span>
          </div>
          {caption ? <SearchBar caption={caption} /> : null}
        </div>
      </Panel>
    );
  }

  return (
    <Panel>
      <div className="w-full max-w-xs rounded-2xl bg-white p-5 shadow-[0_10px_30px_-18px_rgba(37,48,102,0.5)]">
        <p className="flex items-center gap-2 text-xs text-ink-400">
          <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />
          {title}
        </p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {["from-sky-300 to-sky-500", "from-blush-300 to-blush-400", "from-sky-200 to-blush-300"].map(
            (tone) => (
              <span
                key={tone}
                className={`h-14 rounded-lg bg-gradient-to-br ${tone}`}
              />
            ),
          )}
        </div>
        {caption ? <SearchBar caption={caption} /> : null}
      </div>
    </Panel>
  );
}
