import { and, count, desc, eq } from "drizzle-orm";
import { Router, type IRouter, type Request } from "express";
import {
  AdminLoginBody,
  AdminLoginResponse,
  GetAdminSessionResponse,
  GetAdminSummaryResponse,
  ListAdminSubmissionsQueryParams,
  ListAdminSubmissionsResponse,
  UpdateAdminSubmissionBody,
  UpdateAdminSubmissionParams,
  UpdateAdminSubmissionResponse,
} from "@workspace/api-zod";
import { db, submissionsTable } from "@workspace/db";
import {
  ADMIN_COOKIE_NAME,
  createAdminSessionToken,
  isValidAdminSessionToken,
  requireAdmin,
  verifyAdminPassword,
} from "../lib/admin-session";
import { allowRequest } from "../lib/rate-limit";
import { toAdminSubmission } from "../lib/submission-view";

const router: IRouter = Router();
const COOKIE_TTL_MS = 8 * 60 * 60 * 1000;

function clientIp(req: Request): string {
  return req.ip || req.socket.remoteAddress || "unknown";
}

router.get("/admin/session", (req, res): void => {
  res.json(
    GetAdminSessionResponse.parse({
      authenticated: isValidAdminSessionToken(
        req.cookies?.[ADMIN_COOKIE_NAME],
      ),
    }),
  );
});

router.post("/admin/login", (req, res): void => {
  if (!allowRequest(`admin-login:${clientIp(req)}`, 5, 15 * 60 * 1000)) {
    res.status(429).json({
      error: "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.",
    });
    return;
  }

  const parsed = AdminLoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ingresa la contraseña de administración." });
    return;
  }

  if (!process.env.ADMIN_PASSWORD || !process.env.SESSION_SECRET) {
    res.status(503).json({
      error: "El acceso de administración aún no está configurado.",
    });
    return;
  }

  if (!verifyAdminPassword(parsed.data.password)) {
    req.log.warn("Failed administrator sign-in");
    res.status(401).json({ error: "La contraseña no es correcta." });
    return;
  }

  res.cookie(ADMIN_COOKIE_NAME, createAdminSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: COOKIE_TTL_MS,
  });
  res.json(AdminLoginResponse.parse({ authenticated: true }));
});

router.post("/admin/logout", (_req, res): void => {
  res.clearCookie(ADMIN_COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
  });
  res.status(204).end();
});

router.get("/admin/summary", requireAdmin, async (_req, res): Promise<void> => {
  const [totalResult, buyerResult, providerResult, latest] = await Promise.all([
    db.select({ value: count() }).from(submissionsTable),
    db
      .select({ value: count() })
      .from(submissionsTable)
      .where(eq(submissionsTable.type, "BUYER")),
    db
      .select({ value: count() })
      .from(submissionsTable)
      .where(eq(submissionsTable.type, "PROVIDER")),
    db
      .select()
      .from(submissionsTable)
      .orderBy(desc(submissionsTable.createdAt))
      .limit(8),
  ]);

  res.json(
    GetAdminSummaryResponse.parse({
      total: totalResult[0]?.value ?? 0,
      buyers: buyerResult[0]?.value ?? 0,
      providers: providerResult[0]?.value ?? 0,
      latest: latest.map(toAdminSubmission),
    }),
  );
});

router.get(
  "/admin/submissions",
  requireAdmin,
  async (req, res): Promise<void> => {
    const parsed = ListAdminSubmissionsQueryParams.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "El filtro de solicitudes no es válido." });
      return;
    }

    const filters = [];
    if (parsed.data.type) {
      filters.push(eq(submissionsTable.type, parsed.data.type));
    }
    if (parsed.data.status) {
      filters.push(eq(submissionsTable.status, parsed.data.status));
    }

    const rows = await db
      .select()
      .from(submissionsTable)
      .where(filters.length > 0 ? and(...filters) : undefined)
      .orderBy(desc(submissionsTable.createdAt))
      .limit(250);

    res.json(
      ListAdminSubmissionsResponse.parse(rows.map(toAdminSubmission)),
    );
  },
);

router.patch(
  "/admin/submissions/:id",
  requireAdmin,
  async (req, res): Promise<void> => {
    const params = UpdateAdminSubmissionParams.safeParse(req.params);
    const body = UpdateAdminSubmissionBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({ error: "La actualización no es válida." });
      return;
    }

    const [updated] = await db
      .update(submissionsTable)
      .set({ status: body.data.status })
      .where(eq(submissionsTable.id, params.data.id))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "No encontramos esa solicitud." });
      return;
    }

    res.json(
      UpdateAdminSubmissionResponse.parse(toAdminSubmission(updated)),
    );
  },
);

export default router;