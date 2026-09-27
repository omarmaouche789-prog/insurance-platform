import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../../middleware/auth";
import { prisma } from "../../lib/prisma";

export const usersRouter = Router();

const listQuerySchema = z.object({
  search: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

usersRouter.get("/", requireAuth, requireRole("ADMIN"), async (req, res, next) => {
  try {
    const { search, page, pageSize } = listQuerySchema.parse(req.query);

    const where = search
      ? {
          OR: [
            { email: { contains: search, mode: "insensitive" as const } },
            { firstName: { contains: search, mode: "insensitive" as const } },
            { lastName: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {};

    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          adminRole: true,
          isActive: true,
          createdAt: true,
        },
      }),
    ]);

    res.status(200).json({ total, page, pageSize, users });
  } catch (err) {
    next(err);
  }
});
