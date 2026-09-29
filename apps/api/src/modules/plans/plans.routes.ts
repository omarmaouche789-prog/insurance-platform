import { Router } from "express";
import { z } from "zod";
import { METAL_TIERS, PLAN_SORTS, PLAN_TYPES } from "@insurance/shared";
import { ZIP_CODE_PATTERN } from "../../integrations/zipLookup";
import { comparePlans, getPlan, searchPlans } from "./plans.service";

// Public: plan discovery is available to guests, so no requireAuth here.
export const plansRouter = Router();

// Multi-value filters arrive comma-separated, e.g. ?metalTier=SILVER,GOLD
const csv = z.string().transform((s) =>
  s
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean),
);

const searchQuerySchema = z.object({
  zip: z.string().regex(ZIP_CODE_PATTERN, "ZIP code must be 5 digits"),
  metalTier: csv.pipe(z.array(z.enum(METAL_TIERS))).optional(),
  planType: csv.pipe(z.array(z.enum(PLAN_TYPES))).optional(),
  carrierId: csv.optional(),
  // Dollars in the URL (what a user types), cents internally.
  maxPremium: z.coerce
    .number()
    .positive()
    .transform((dollars) => Math.round(dollars * 100))
    .optional(),
  hsaEligible: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
  sort: z.enum(PLAN_SORTS).default("premium"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

plansRouter.get("/", async (req, res, next) => {
  try {
    const q = searchQuerySchema.parse(req.query);
    const result = await searchPlans({
      zipCode: q.zip,
      metalTiers: q.metalTier,
      planTypes: q.planType,
      carrierIds: q.carrierId,
      maxPremiumCents: q.maxPremium,
      hsaEligible: q.hsaEligible,
      sort: q.sort,
      page: q.page,
      pageSize: q.pageSize,
    });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

const compareQuerySchema = z.object({ ids: csv });

// Registered before "/:id" so "compare" isn't captured as a plan id.
plansRouter.get("/compare", async (req, res, next) => {
  try {
    const { ids } = compareQuerySchema.parse(req.query);
    res.status(200).json({ plans: await comparePlans(ids) });
  } catch (err) {
    next(err);
  }
});

plansRouter.get("/:id", async (req, res, next) => {
  try {
    res.status(200).json({ plan: await getPlan(req.params.id) });
  } catch (err) {
    next(err);
  }
});
