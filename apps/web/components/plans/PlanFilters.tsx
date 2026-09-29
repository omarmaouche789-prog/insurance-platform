"use client";

import type { CarrierDTO, PlanSort } from "@insurance/shared";
import { METAL_TIERS, PLAN_TYPES } from "@insurance/shared";

// Filter state mirrors the URL query string, so results are shareable/bookmarkable.
export interface PlanFilterValues {
  metalTier: string[];
  planType: string[];
  carrierId: string[];
  maxPremium: string;
  hsaEligible: boolean;
  sort: PlanSort;
}

interface PlanFiltersProps {
  values: PlanFilterValues;
  carriers: CarrierDTO[];
  onChange: (values: PlanFilterValues) => void;
}

const SORT_LABELS: Record<PlanSort, string> = {
  premium: "Lowest premium",
  deductible: "Lowest deductible",
  outOfPocketMax: "Lowest out-of-pocket max",
};

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function titleCase(s: string): string {
  return s.charAt(0) + s.slice(1).toLowerCase();
}

export function PlanFilters({ values, carriers, onChange }: PlanFiltersProps) {
  return (
    <aside className="space-y-6 text-sm">
      <div>
        <label className="font-medium" htmlFor="sort">
          Sort by
        </label>
        <select
          id="sort"
          className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
          value={values.sort}
          onChange={(e) => onChange({ ...values, sort: e.target.value as PlanSort })}
        >
          {Object.entries(SORT_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <fieldset>
        <legend className="font-medium">Metal tier</legend>
        {METAL_TIERS.map((tier) => (
          <label key={tier} className="mt-1 flex items-center gap-2">
            <input
              type="checkbox"
              checked={values.metalTier.includes(tier)}
              onChange={() => onChange({ ...values, metalTier: toggle(values.metalTier, tier) })}
            />
            {titleCase(tier)}
          </label>
        ))}
      </fieldset>

      <fieldset>
        <legend className="font-medium">Plan type</legend>
        {PLAN_TYPES.map((type) => (
          <label key={type} className="mt-1 flex items-center gap-2">
            <input
              type="checkbox"
              checked={values.planType.includes(type)}
              onChange={() => onChange({ ...values, planType: toggle(values.planType, type) })}
            />
            {type}
          </label>
        ))}
      </fieldset>

      {carriers.length > 0 && (
        <fieldset>
          <legend className="font-medium">Carrier</legend>
          {carriers.map((carrier) => (
            <label key={carrier.id} className="mt-1 flex items-center gap-2">
              <input
                type="checkbox"
                checked={values.carrierId.includes(carrier.id)}
                onChange={() => onChange({ ...values, carrierId: toggle(values.carrierId, carrier.id) })}
              />
              {carrier.name}
            </label>
          ))}
        </fieldset>
      )}

      <div>
        <label className="font-medium" htmlFor="maxPremium">
          Max monthly premium ($)
        </label>
        <input
          id="maxPremium"
          type="number"
          min={1}
          className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
          value={values.maxPremium}
          onChange={(e) => onChange({ ...values, maxPremium: e.target.value })}
        />
      </div>

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={values.hsaEligible}
          onChange={(e) => onChange({ ...values, hsaEligible: e.target.checked })}
        />
        HSA eligible only
      </label>
    </aside>
  );
}
