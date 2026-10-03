import { Router } from "express";
import { z } from "zod";
import { prisma } from "./prisma.js";
import {
  authenticate,
  createAccessToken,
  createRefreshToken,
  hashPassword,
  revokeRefreshToken,
  rotateRefreshToken,
  verifyPassword,
} from "./auth.js";

const router = Router();

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(100),
});

const registerSchema = credentialsSchema.extend({
  name: z.string().trim().min(2).max(100),
});

const projectQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  categoryId: z.string().cuid().optional(),
  skillId: z.string().cuid().optional(),
  currency: z.enum(["USD", "MMK"]).optional(),
  status: z
    .enum([
      "DRAFT",
      "PUBLISHED",
      "IN_REVIEW",
      "IN_PROGRESS",
      "COMPLETED",
      "CANCELLED",
      "CLOSED",
    ])
    .optional(),
  minBudget: z.coerce.number().nonnegative().optional(),
  maxBudget: z.coerce.number().nonnegative().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(12),
});

function serializeProject(project: {
  id: string;
  title: string;
  description: string;
  minBudget: unknown;
  maxBudget: unknown;
  currency: string;
  deadline: Date | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  category: { id: string; name: string };
  client: { id: string; name: string; avatarUrl: string | null };
  projectSkills: { skill: { id: string; name: string } }[];
  _count?: { proposals: number };
}) {
  return {
    id: project.id,
    title: project.title,
    description: project.description,
    minBudget: project.minBudget?.toString() ?? null,
    maxBudget: project.maxBudget?.toString() ?? null,
    currency: project.currency,
    deadline: project.deadline,
    status: project.status,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    category: project.category,
    client: project.client,
    skills: project.projectSkills.map(({ skill }) => skill),
    proposalsCount: project._count?.proposals ?? 0,
  };
}

router.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "archer-api",
    timestamp: new Date().toISOString(),
  });
});

router.get("/projects", async (req, res, next) => {
  try {
    const input = projectQuerySchema.parse(req.query);
    const where = {
      status: input.status ?? "PUBLISHED",
      ...(input.categoryId ? { categoryId: input.categoryId } : {}),
      ...(input.currency ? { currency: input.currency } : {}),
      ...(input.skillId
        ? { projectSkills: { some: { skillId: input.skillId } } }
        : {}),
      ...(input.search
        ? {
            OR: [
              { title: { contains: input.search } },
              { description: { contains: input.search } },
            ],
          }
        : {}),
      ...(input.minBudget !== undefined
        ? { maxBudget: { gte: input.minBudget } }
        : {}),
      ...(input.maxBudget !== undefined
        ? { minBudget: { lte: input.maxBudget } }
        : {}),
    };
    const skip = (input.page - 1) * input.pageSize;
    const [projects, totalItems] = await prisma.$transaction([
      prisma.project.findMany({
        where,
        skip,
        take: input.pageSize,
        orderBy: { createdAt: "desc" },
        include: {
          category: { select: { id: true, name: true } },
          client: { select: { id: true, name: true, avatarUrl: true } },
          projectSkills: {
            include: { skill: { select: { id: true, name: true } } },
          },
          _count: { select: { proposals: true } },
        },
      }),
      prisma.project.count({ where }),
    ]);
    return res.json({
      items: projects.map(serializeProject),
      page: input.page,
      pageSize: input.pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / input.pageSize),
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/projects/:id", async (req, res, next) => {
  try {
    const project = await prisma.project.findFirst({
      where: {
        id: req.params.id,
        OR: [
          { status: "PUBLISHED" },
          ...(req.authUser ? [{ clientId: req.authUser.id }] : []),
        ],
      },
      include: {
        category: { select: { id: true, name: true } },
        client: { select: { id: true, name: true, avatarUrl: true } },
        projectSkills: {
          include: { skill: { select: { id: true, name: true } } },
        },
        _count: { select: { proposals: true } },
      },
    });
    if (!project) {
      return res.status(404).json({
        error: { code: "PROJECT_NOT_FOUND", message: "Project not found." },
      });
    }
    return res.json({ project: serializeProject(project) });
  } catch (error) {
    return next(error);
  }
});

router.get("/categories", async (_req, res, next) => {
  try {
    return res.json({
      categories: await prisma.category.findMany({ orderBy: { name: "asc" } }),
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/skills", async (_req, res, next) => {
  try {
    return res.json({
      skills: await prisma.skill.findMany({ orderBy: { name: "asc" } }),
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/auth/register", async (req, res, next) => {
  try {
    const input = registerSchema.parse(req.body);
    const email = input.email.toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing)
      return res.status(409).json({
        error: {
          code: "EMAIL_IN_USE",
          message: "An account with this email already exists.",
        },
      });
    const user = await prisma.user.create({
      data: {
        email,
        name: input.name,
        passwordHash: await hashPassword(input.password),
      },
    });
    const authUser = { id: user.id, email: user.email, role: user.role };
    return res.status(201).json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      accessToken: createAccessToken(authUser),
      refreshToken: await createRefreshToken(user.id),
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/auth/login", async (req, res, next) => {
  try {
    const input = credentialsSchema.parse(req.body);
    const user = await prisma.user.findUnique({
      where: { email: input.email.toLowerCase() },
    });
    if (!user || !(await verifyPassword(input.password, user.passwordHash)))
      return res.status(401).json({
        error: {
          code: "INVALID_CREDENTIALS",
          message: "Email or password is incorrect.",
        },
      });
    const authUser = { id: user.id, email: user.email, role: user.role };
    return res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      accessToken: createAccessToken(authUser),
      refreshToken: await createRefreshToken(user.id),
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/auth/refresh", async (req, res, next) => {
  try {
    const token = z
      .object({ refreshToken: z.string().min(1) })
      .parse(req.body).refreshToken;
    const result = await rotateRefreshToken(token);
    if (!result)
      return res.status(401).json({
        error: {
          code: "INVALID_REFRESH_TOKEN",
          message: "Refresh token is invalid or expired.",
        },
      });
    return res.json(result);
  } catch (error) {
    return next(error);
  }
});

router.post("/auth/logout", async (req, res, next) => {
  try {
    const token = z
      .object({ refreshToken: z.string().min(1) })
      .parse(req.body).refreshToken;
    await revokeRefreshToken(token);
    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

router.get("/me", authenticate, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.authUser!.id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        headline: true,
        biography: true,
        location: true,
        avatarUrl: true,
        hourlyRate: true,
        hourlyCurrency: true,
        availability: true,
        createdAt: true,
      },
    });
    if (!user)
      return res.status(404).json({
        error: { code: "USER_NOT_FOUND", message: "User not found." },
      });
    return res.json({ user });
  } catch (error) {
    return next(error);
  }
});

export { router };
