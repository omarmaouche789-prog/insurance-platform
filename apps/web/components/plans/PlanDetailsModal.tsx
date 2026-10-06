"use client";

import { ArrowRight, ExternalLink } from "lucide-react";
import type { PlanDTO } from "@insurance/shared";
import { formatCents } from "@insurance/shared";
import { ButtonLink } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { MetalTierBadge } from "./MetalTierBadge";
import { PlanFacts } from "./PlanFacts";
import { enrollHref } from "./planInfo";

export function PlanDetailsModal({ plan, onClose }: { plan: PlanDTO | null; onClose: () => void }) {
  return (
    <Modal
      open={plan !== null}
      onClose={onClose}
      size="lg"
      title={plan?.name ?? ""}
      description={
        plan && (
          <span className="flex flex-wrap items-center gap-2 text-xs">
            <span className="uppercase tracking-wide">{plan.carrier.name}</span>
            <MetalTierBadge tier={plan.metalTier} />
            <span className="rounded bg-gray-100 px-2 py-0.5 text-gray-700">{plan.planType}</span>
            <span className="text-sm font-semibold text-gray-900">{formatCents(plan.monthlyPremiumCents)}/month</span>
          </span>
        )
      }
      footer={
        plan && (
          <>
            <ButtonLink href={`/plans/${plan.id}`} icon={<ExternalLink className="h-4 w-4" />} className="mr-auto">
              Open full page
            </ButtonLink>
            <ButtonLink href={enrollHref(plan)} variant="accent">
              Enroll in this plan <ArrowRight className="h-4 w-4" aria-hidden />
            </ButtonLink>
          </>
        )
      }
    >
      {plan && <PlanFacts plan={plan} />}
    </Modal>
  );
}
