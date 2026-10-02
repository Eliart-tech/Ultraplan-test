"use client";

import { ArrowLeftRight, Lightbulb } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PlatformStack } from "@/components/ui/platform-icon";
import { ScoreRing } from "@/components/ui/score-ring";
import { ANGLE_TYPE_LABELS } from "@/lib/script/levels";
import type { Angle, Topic } from "@/lib/types";
import { TopicBadges } from "./topic-card";

export interface TopicRecapProps {
  topic: Topic;
  /** Shown as a second line when set (Script step). */
  angle?: Angle | null;
  /** "Changer de sujet" (hidden when there is no analysis to go back to). */
  onChangeTopic?: () => void;
  /** "Changer d'angle". */
  onChangeAngle?: () => void;
}

/** Compact reminder of the chosen topic (and angle) at the top of steps 3 and 4. */
export function TopicRecap({ topic, angle, onChangeTopic, onChangeAngle }: TopicRecapProps) {
  return (
    <Card as="section" aria-label="Sujet choisi" className="p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-4">
          <ScoreRing value={topic.scores.total} size={48} label="Score total" className="hidden sm:inline-flex" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.06em] text-muted">Sujet choisi</p>
              <PlatformStack platforms={topic.platforms} size="xs" />
            </div>
            <p className="mt-1 text-base font-semibold leading-snug text-ink">{topic.title}</p>
            {angle ? (
              <p className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-muted">
                <Lightbulb aria-hidden className="size-4 shrink-0 text-accent" />
                <span className="sr-only">Angle :</span>
                <span className="font-medium text-ink">{angle.title}</span>
                <Badge size="sm" tone="accent">
                  {ANGLE_TYPE_LABELS[angle.type] ?? angle.type}
                </Badge>
              </p>
            ) : (
              <>
                {topic.whyNow ? <p className="mt-1 line-clamp-2 text-sm text-muted">{topic.whyNow}</p> : null}
                <TopicBadges topic={topic} className="mt-2" />
              </>
            )}
          </div>
        </div>
        {onChangeTopic || onChangeAngle ? (
          <div className="flex shrink-0 flex-wrap gap-2">
            {onChangeAngle ? (
              <Button size="sm" variant="secondary" onClick={onChangeAngle}>
                Changer d&apos;angle
              </Button>
            ) : null}
            {onChangeTopic ? (
              <Button
                size="sm"
                variant={onChangeAngle ? "ghost" : "secondary"}
                leftIcon={<ArrowLeftRight aria-hidden className="size-4" />}
                onClick={onChangeTopic}
              >
                Changer de sujet
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </Card>
  );
}
