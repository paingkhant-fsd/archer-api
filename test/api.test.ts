import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { hashPassword, verifyPassword } from "../src/auth.js";
import {
  Currency,
  ProjectStatus,
  Role,
} from "../src/generated/prisma/client.js";
import { prisma } from "../src/prisma.js";

type JsonObject = Record<string, unknown>;

let server: Server;
let apiUrl: string;
let fixturePasswordHash: string;

async function request(
  path: string,
  init: RequestInit = {},
): Promise<{ response: Response; body: JsonObject | null }> {
  const response = await fetch(`${apiUrl}${path}`, init);
  const body = response.status === 204
    ? null
    : await response.json() as JsonObject;
  return { response, body };
}

function postJson(path: string, body: JsonObject) {
  return request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function clearDatabase(): Promise<void> {
  await prisma.$transaction([
    prisma.notification.deleteMany(),
    prisma.review.deleteMany(),
    prisma.proposal.deleteMany(),
    prisma.projectSkill.deleteMany(),
    prisma.project.deleteMany(),
    prisma.portfolioItem.deleteMany(),
    prisma.userSkill.deleteMany(),
    prisma.skill.deleteMany(),
    prisma.category.deleteMany(),
    prisma.passwordResetToken.deleteMany(),
    prisma.refreshToken.deleteMany(),
    prisma.auditEvent.deleteMany(),
    prisma.user.deleteMany(),
  ]);
}

async function createUser(overrides: Partial<{
  id: string;
  email: string;
  name: string;
  role: Role;
}> = {}) {
  return prisma.user.create({
    data: {
      ...(overrides.id ? { id: overrides.id } : {}),
      email: overrides.email ?? "freelancer@example.test",
      name: overrides.name ?? "Test Freelancer",
      passwordHash: fixturePasswordHash,
      role: overrides.role ?? Role.FREELANCER,
    },
  });
}

async function login(email: string, password = "ValidPassword123!") {
  const result = await postJson("/auth/login", { email, password });
  expect(result.response.status).toBe(200);
  return result.body as {
    user: { id: string; email: string; name: string; role: string };
    accessToken: string;
    refreshToken: string;
  };
}

async function createProjectFixtures() {
  const client = await createUser({
    email: "client@example.test",
    name: "Test Client",
    role: Role.CLIENT,
  });
  const design = await prisma.category.create({ data: { name: "Design" } });
  const development = await prisma.category.create({
    data: { name: "Development" },
  });
  const react = await prisma.skill.create({ data: { name: "React" } });
  const figma = await prisma.skill.create({ data: { name: "Figma" } });

  const publishedUsd = await prisma.project.create({
    data: {
      clientId: client.id,
      categoryId: development.id,
      title: "Alpha React dashboard",
      description: "Build a reporting dashboard.",
      minBudget: "100.25",
      maxBudget: "500.75",
      currency: Currency.USD,
      status: ProjectStatus.PUBLISHED,
      deadline: new Date("2030-02-01T00:00:00.000Z"),
      createdAt: new Date("2026-01-03T00:00:00.000Z"),
      projectSkills: { create: [{ skillId: react.id }] },
    },
  });
  const publishedMmk = await prisma.project.create({
    data: {
      clientId: client.id,
      categoryId: design.id,
      title: "Beta mobile design",
      description: "Create a Figma prototype.",
      minBudget: "100000",
      maxBudget: "300000",
      currency: Currency.MMK,
      status: ProjectStatus.PUBLISHED,
      createdAt: new Date("2026-01-02T00:00:00.000Z"),
      projectSkills: { create: [{ skillId: figma.id }] },
    },
  });
  const draft = await prisma.project.create({
    data: {
      clientId: client.id,
      categoryId: development.id,
      title: "Private draft",
      description: "This project must not be public.",
      currency: Currency.USD,
      status: ProjectStatus.DRAFT,
      createdAt: new Date("2026-01-04T00:00:00.000Z"),
    },
  });

  return { publishedUsd, publishedMmk, draft, design, development, react };
}

beforeAll(async () => {
  fixturePasswordHash = await hashPassword("ValidPassword123!");
  server = app.listen(0);
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const address = server.address() as AddressInfo;
  apiUrl = `http://127.0.0.1:${address.port}/api/v1`;
});

beforeEach(clearDatabase);

afterAll(async () => {
  await prisma.$disconnect();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
});

describe("authentication", () => {
  it("registers a normalized account without exposing its password hash", async () => {
    const { response, body } = await postJson("/auth/register", {
      name: "  New User  ",
      email: "NEW.USER@EXAMPLE.TEST",
      password: "ValidPassword123!",
    });

    expect(response.status).toBe(201);
    expect(body).toMatchObject({
      user: {
        email: "new.user@example.test",
        name: "New User",
        role: "FREELANCER",
      },
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
    });
    expect(JSON.stringify(body)).not.toContain("passwordHash");

    const stored = await prisma.user.findUniqueOrThrow({
      where: { email: "new.user@example.test" },
    });
    expect(stored.passwordHash).not.toBe("ValidPassword123!");
    await expect(
      verifyPassword("ValidPassword123!", stored.passwordHash),
    ).resolves.toBe(true);
  });

  it("returns the standard validation error for invalid credentials input", async () => {
    const { response, body } = await postJson("/auth/register", {
      name: "A",
      email: "not-an-email",
      password: "short",
    });

    expect(response.status).toBe(400);
    expect(body).toMatchObject({
      error: {
        code: "VALIDATION_ERROR",
        message: "The request is invalid.",
      },
    });
  });

  it("rejects duplicate registration and invalid login without exposing details", async () => {
    await createUser({ email: "existing@example.test" });

    const duplicate = await postJson("/auth/register", {
      name: "Existing User",
      email: "EXISTING@example.test",
      password: "ValidPassword123!",
    });
    expect(duplicate.response.status).toBe(409);
    expect(duplicate.body).toEqual({
      error: {
        code: "EMAIL_IN_USE",
        message: "An account with this email already exists.",
      },
    });

    const invalidLogin = await postJson("/auth/login", {
      email: "existing@example.test",
      password: "WrongPassword123!",
    });
    expect(invalidLogin.response.status).toBe(401);
    expect(invalidLogin.body).toEqual({
      error: {
        code: "INVALID_CREDENTIALS",
        message: "Email or password is incorrect.",
      },
    });
  });

  it("rotates refresh tokens and rejects replay of the old token", async () => {
    await createUser({ email: "rotation@example.test" });
    const session = await login("ROTATION@example.test");

    const rotated = await postJson("/auth/refresh", {
      refreshToken: session.refreshToken,
    });
    expect(rotated.response.status).toBe(200);
    expect(rotated.body).toMatchObject({
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
    });
    expect(rotated.body?.refreshToken).not.toBe(session.refreshToken);

    const replay = await postJson("/auth/refresh", {
      refreshToken: session.refreshToken,
    });
    expect(replay.response.status).toBe(401);
    expect(replay.body).toMatchObject({
      error: { code: "INVALID_REFRESH_TOKEN" },
    });
  });

  it("revokes the refresh token on logout", async () => {
    await createUser({ email: "logout@example.test" });
    const session = await login("logout@example.test");

    const logout = await postJson("/auth/logout", {
      refreshToken: session.refreshToken,
    });
    expect(logout.response.status).toBe(204);
    expect(logout.body).toBeNull();

    const refresh = await postJson("/auth/refresh", {
      refreshToken: session.refreshToken,
    });
    expect(refresh.response.status).toBe(401);
  });

  it("protects the current-user route and omits private account fields", async () => {
    await createUser({ email: "profile@example.test" });

    const anonymous = await request("/me");
    expect(anonymous.response.status).toBe(401);
    expect(anonymous.body).toMatchObject({
      error: { code: "UNAUTHENTICATED" },
    });

    const session = await login("profile@example.test");
    const authenticated = await request("/me", {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    });
    expect(authenticated.response.status).toBe(200);
    expect(authenticated.body).toMatchObject({
      user: { email: "profile@example.test", role: "FREELANCER" },
    });
    expect(JSON.stringify(authenticated.body)).not.toMatch(
      /passwordHash|refreshToken|tokenHash/,
    );
  });
});

describe("project discovery", () => {
  it("returns only published projects, even when a private status is requested", async () => {
    const fixtures = await createProjectFixtures();

    const defaultList = await request("/projects");
    expect(defaultList.response.status).toBe(200);
    expect(defaultList.body).toMatchObject({
      page: 1,
      pageSize: 12,
      totalItems: 2,
      totalPages: 1,
    });
    expect(
      (defaultList.body?.items as Array<{ id: string }>).map(({ id }) => id),
    ).toEqual([fixtures.publishedUsd.id, fixtures.publishedMmk.id]);

    const attemptedDraftList = await request("/projects?status=DRAFT");
    expect(attemptedDraftList.response.status).toBe(200);
    expect(
      (attemptedDraftList.body?.items as Array<{ id: string }>).map(({ id }) => id),
    ).toEqual([fixtures.publishedUsd.id, fixtures.publishedMmk.id]);
  });

  it("applies search, category, skill, currency, and budget filters", async () => {
    const fixtures = await createProjectFixtures();
    const cases = [
      ["search=dashboard", fixtures.publishedUsd.id],
      [`categoryId=${fixtures.design.id}`, fixtures.publishedMmk.id],
      [`skillId=${fixtures.react.id}`, fixtures.publishedUsd.id],
      ["currency=MMK", fixtures.publishedMmk.id],
      ["minBudget=400&maxBudget=600", fixtures.publishedUsd.id],
    ] as const;

    for (const [query, expectedId] of cases) {
      const { response, body } = await request(`/projects?${query}`);
      expect(response.status, query).toBe(200);
      expect(body?.totalItems, query).toBe(1);
      expect(
        (body?.items as Array<{ id: string }>)[0]?.id,
        query,
      ).toBe(expectedId);
    }
  });

  it("paginates in newest-first order", async () => {
    const fixtures = await createProjectFixtures();

    const firstPage = await request("/projects?page=1&pageSize=1");
    expect(firstPage.body).toMatchObject({
      page: 1,
      pageSize: 1,
      totalItems: 2,
      totalPages: 2,
    });
    expect(
      (firstPage.body?.items as Array<{ id: string }>)[0]?.id,
    ).toBe(fixtures.publishedUsd.id);

    const secondPage = await request("/projects?page=2&pageSize=1");
    expect(
      (secondPage.body?.items as Array<{ id: string }>)[0]?.id,
    ).toBe(fixtures.publishedMmk.id);
  });

  it("returns a stable project response contract with decimal strings and UTC dates", async () => {
    const fixtures = await createProjectFixtures();
    await prisma.proposal.create({
      data: {
        projectId: fixtures.publishedUsd.id,
        freelancerId: (await createUser()).id,
        coverLetter: "A focused proposal.",
        proposedPrice: "350.50",
        currency: Currency.USD,
        estimatedDuration: "2 weeks",
      },
    });

    const { response, body } = await request(
      `/projects/${fixtures.publishedUsd.id}`,
    );
    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      project: {
        id: fixtures.publishedUsd.id,
        minBudget: "100.25",
        maxBudget: "500.75",
        currency: "USD",
        status: "PUBLISHED",
        deadline: "2030-02-01T00:00:00.000Z",
        createdAt: "2026-01-03T00:00:00.000Z",
        category: { name: "Development" },
        client: { name: "Test Client" },
        skills: [{ name: "React" }],
        proposalsCount: 1,
      },
    });
  });

  it("does not expose draft project details publicly", async () => {
    const fixtures = await createProjectFixtures();
    const { response, body } = await request(`/projects/${fixtures.draft.id}`);

    expect(response.status).toBe(404);
    expect(body).toEqual({
      error: { code: "PROJECT_NOT_FOUND", message: "Project not found." },
    });
  });

  it("rejects invalid pagination, currency, budget, and identifier inputs", async () => {
    await createProjectFixtures();
    const paths = [
      "/projects?page=0",
      "/projects?pageSize=51",
      "/projects?currency=EUR",
      "/projects?minBudget=-1",
      "/projects?categoryId=not-a-cuid",
    ];

    for (const path of paths) {
      const { response, body } = await request(path);
      expect(response.status, path).toBe(400);
      expect(body, path).toMatchObject({
        error: { code: "VALIDATION_ERROR" },
      });
    }
  });

  it("lists categories and skills alphabetically", async () => {
    await createProjectFixtures();
    const categories = await request("/categories");
    const skills = await request("/skills");

    expect(categories.response.status).toBe(200);
    expect(categories.body?.categories).toMatchObject([
      { name: "Design" },
      { name: "Development" },
    ]);
    expect(skills.response.status).toBe(200);
    expect(skills.body?.skills).toMatchObject([
      { name: "Figma" },
      { name: "React" },
    ]);
  });
});
