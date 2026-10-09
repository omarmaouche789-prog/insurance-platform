"use client";

import type { MouseEvent } from "react";
import { ArrowRight, Check, Info } from "lucide-react";
import type { PlanDTO } from "@insurance/shared";
import { formatCents } from "@insurance/shared";
import { Button, ButtonLink } from "../ui/Button";
import { cn } from "../ui/cn";
import { MetalTierBadge } from "./MetalTierBadge";
import { enrollHref } from "./planInfo";

interface PlanCardProps {
  plan: PlanDTO;
  // The one plan the shopper has picked (single selection).
  chosen: boolean;
  onChoose: (plan: PlanDTO) => void;
  onShowDetails: (plan: PlanDTO) => void;
  // Independent multi-select for side-by-side comparison.
  compared: boolean;
  compareDisabled: boolean;
  onToggleCompare: (planId: string) => void;
}

// Clicks on buttons, links and the compare checkbox do their own thing and
// must not also select the card.
const fromControl = (e: MouseEvent) => (e.target as HTMLElement).closest("a, button, input, label") !== null;

// The whole card is the selection target: click to select, double-click for
// details. A real radio input carries the selected state for keyboard and
// screen-reader users (cards are grouped as a radiogroup by the list).
export function PlanCard({ plan, chosen, onChoose, onShowDetails, compared, compareDisabled, onToggleCompare }: PlanCardProps) {
  const radioId = `plan-choice-${plan.id}`;
  return (
    <article
      onClick={(e) => !fromControl(e) && onChoose(plan)}
      onDoubleClick={(e) => !fromControl(e) && onShowDetails(plan)}
      className={cn(
        "group relative cursor-pointer select-none rounded-xl border bg-white p-5 transition-all duration-150",
        chosen
          ? "border-primary-navy bg-blue-50 shadow-md ring-2 ring-primary-navy/20"
          : "border-gray-200 shadow-card hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-md",
      )}
      aria-labelledby={`${radioId}-name`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <input
            id={radioId}
            type="radio"
            name="chosen-plan"
            checked={chosen}
            onChange={() => onChoose(plan)}
            className="peer sr-only"
            aria-label={`Select ${plan.name}`}
          />
          {/* Visual radio; the real input above is screen-reader only. */}
          <label
            htmlFor={radioId}
            aria-hidden
            className={cn(
              "mt-0.5 flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-primary-navy peer-focus-visible:ring-offset-2",
              chosen ? "border-primary-navy bg-primary-navy text-onaccent" : "border-gray-300 bg-white group-hover:border-gray-400",
            )}
          >
            {chosen && <Check className="h-3 w-3" strokeWidth={3} />}
          </label>
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{plan.carrier.name}</p>
            <h2 id={`${radioId}-name`} className="font-semibold text-gray-900">
              {plan.name}
            </h2>
            <div className="mt-1.5 flex flex-wrap gap-1.5 text-xs">
              <MetalTierBadge tier={plan.metalTier} />
              <span className="rounded bg-gray-100 px-2 py-0.5 text-gray-700">{plan.planType}</span>
              {plan.hsaEligible && <span className="rounded bg-gray-100 px-2 py-0.5 text-gray-700">HSA eligible</span>}
            </div>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-2xl font-bold tabular-nums text-gray-900">{formatCents(plan.monthlyPremiumCents)}</p>
          <p className="text-xs text-gray-500">per month</p>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-3 pl-8 text-sm">
        <div>
          <dt className="text-gray-500">Deductible</dt>
          <dd className="font-medium tabular-nums text-gray-900">{formatCents(plan.deductibleCents)}</dd>
        </div>
        <div>
          <dt className="text-gray-500">Out-of-pocket max</dt>
          <dd className="font-medium tabular-nums text-gray-900">{formatCents(plan.outOfPocketMaxCents)}</dd>
        </div>
        <div>
          <dt className="text-gray-500">Primary care</dt>
          <dd className="font-medium tabular-nums text-gray-900">{formatCents(plan.primaryCareCopayCents)} copay</dd>
        </div>
      </dl>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-4 pl-8">
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={compared}
            disabled={compareDisabled && !compared}
            onChange={() => onToggleCompare(plan.id)}
            className="h-4 w-4 rounded border-gray-300 accent-primary-navy"
          />
          Compare
        </label>
        <div className="flex items-center gap-2">
          <Button size="sm" variant={chosen ? "secondary" : "ghost"} icon={<Info className="h-3.5 w-3.5" />} onClick={() => onShowDetails(plan)}>
            View details
          </Button>
          {chosen && (
            <ButtonLink href={enrollHref(plan)} size="sm" variant="accent" className="animate-fade-in">
              Enroll <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </ButtonLink>
          )}
        </div>
      </div>
    </article>
  );
}
