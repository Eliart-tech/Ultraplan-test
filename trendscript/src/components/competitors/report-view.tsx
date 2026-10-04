"use client";

import { RefreshCw, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { isMetricsStripped, isRetentionExpired } from "@/lib/client/storage";
import type { CompetitorReport } from "@/lib/types";
import {
  FollowersSection,
  HooksSection,
  MethodSection,
  OverperformersSection,
  PerformanceSection,
  PillarsSection,
  PostsSection,
  RhythmSection,
  StatsOnlyAlert,
  WorksFlopsSection,
} from "./report-evidence";
import { ForYouSection, IdeasSection } from "./report-for-you";
import { ReportHeader, ReportSummary } from "./report-overview";
import { ReportNav, ReportSection, type ReportNavItem } from "./report-section";

export interface ReportViewProps {
  report: CompetitorReport;
  /** From `useNow()`. */
  now: number;
  /** null while /api/sources is loading. */
  aiConfigured: boolean | null;
  onReanalyse?: () => void;
  onDelete?: () => void;
  onWriteIdea?: (ideaIndex: number) => void;
  /** An analysis is running (re-analyse disabled). */
  busy?: boolean;
  /** Extra message under the header (save failure…). */
  notice?: ReactNode;
}

/**
 * A competitor report, scannable top-down: identity → "En bref" (KPIs and
 * takeaways) → evidence (what overperforms, what brings followers, every
 * post on a chart, what works / flops, hooks, pillars, rhythm) → what it
 * means for the user (differentiation, gaps, do-not-copy, ideas with
 * "Écrire ce script") → all posts → sources. Stats-only reports keep every
 * real number and say what is missing.
 */
export function ReportView({ report, now, aiConfigured, onReanalyse, onDelete, onWriteIdea, busy, notice }: ReportViewProps) {
  const hasInsights = Boolean(report.insights);
  // YouTube statistics older than 30 days are erased: text only.
  const expired = isMetricsStripped(report) || isRetentionExpired(report, now);
  const numbers = !expired;
  const nav: ReportNavItem[] = [
    { id: "synthese", label: "En bref" },
    ...(numbers
      ? [
          { id: "surperforme", label: "Ce qui surperforme" },
          { id: "abonnes", label: "Ce qui fait s'abonner" },
          { id: "performance", label: "Publication par publication" },
        ]
      : []),
    { id: "marche", label: "Ce qui marche" },
    ...(hasInsights
      ? [
          { id: "hooks", label: "Hooks" },
          { id: "piliers", label: "Piliers et formats" },
        ]
      : []),
    ...(numbers ? [{ id: "rythme", label: "Quand publier" }] : []),
    { id: "pour-toi", label: "Pour toi" },
    { id: "idees", label: "Idées de vidéos" },
    ...(numbers ? [{ id: "publications", label: "Publications" }] : []),
    { id: "methode", label: "Sources et méthode" },
  ];

  return (
    <article className="flex flex-col gap-8" aria-label={`Analyse de @${report.data.account.handle}`}>
      <ReportHeader report={report} now={now} onReanalyse={onReanalyse} onDelete={onDelete} busy={busy} />
      {notice}
      {expired ? (
        <Alert
          tone="warning"
          role="none"
          title="Analyse de plus de 30 jours : relancez-la"
          action={
            onReanalyse ? (
              <Button size="sm" leftIcon={<RefreshCw aria-hidden className="size-4" />} onClick={onReanalyse} disabled={busy}>
                Ré-analyser
              </Button>
            ) : null
          }
        >
          Les règles développeurs de YouTube interdisent de conserver les statistiques d&apos;une chaîne plus de 30 jours :
          elles ont été effacées de ce navigateur. L&apos;analyse écrite reste consultable.
        </Alert>
      ) : null}
      {report.mode === "stats" && !expired ? <StatsOnlyAlert report={report} aiConfigured={aiConfigured} /> : null}

      <div className="lg:grid lg:grid-cols-[11rem_minmax(0,1fr)] lg:gap-8 xl:grid-cols-[12.5rem_minmax(0,1fr)] xl:gap-10">
        <ReportNav items={nav} />
        <div className="flex min-w-0 flex-col gap-12">
          <ReportSection id="synthese" icon={<Sparkles />} tone="foryou" title="En bref">
            <ReportSummary report={report} hideNumbers={expired} />
          </ReportSection>
          {numbers ? <OverperformersSection report={report} now={now} /> : null}
          {numbers ? <FollowersSection report={report} now={now} /> : null}
          {numbers ? <PerformanceSection report={report} now={now} /> : null}
          <WorksFlopsSection report={report} now={now} />
          {hasInsights ? <HooksSection report={report} now={now} /> : null}
          {hasInsights ? <PillarsSection report={report} now={now} /> : null}
          {numbers ? <RhythmSection report={report} now={now} /> : null}
          <ForYouSection report={report} />
          <IdeasSection report={report} onWriteIdea={onWriteIdea} />
          {numbers ? <PostsSection report={report} now={now} /> : null}
          <MethodSection report={report} now={now} />
        </div>
      </div>
    </article>
  );
}

export interface ReportPreviewProps {
  report: CompetitorReport;
  now: number;
}

/**
 * The real data of a running analysis (posts + statistics arrive before
 * Claude's analysis): header, KPIs, what overperforms, what brings
 * followers and the chart, with placeholders where Claude will write.
 */
export function ReportPreview({ report, now }: ReportPreviewProps) {
  return (
    <section aria-label="Aperçu des données" className="flex flex-col gap-8 animate-fade-in">
      <ReportHeader report={report} now={now} pending titleAs="h2" />
      <ReportSummary report={report} pending />
      <OverperformersSection report={report} now={now} pending />
      <FollowersSection report={report} now={now} pending />
      <PerformanceSection report={report} now={now} pending />
    </section>
  );
}
