import { and, eq, gt, sql } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import {
  db,
  submissionsTable,
  type InsertSubmission,
  type Submission,
} from "@workspace/db";
import {
  GetPublicConfigResponse,
  SubmitBuyerBody,
  SubmitBuyerResponse,
  SubmitProviderBody,
  SubmitProviderResponse,
} from "@workspace/api-zod";
import { sendSubmissionEmails } from "../lib/email";
import { allowRequest } from "../lib/rate-limit";

const router: IRouter = Router();
const DUPLICATE_WINDOW_MS = 15 * 60 * 1000;

class RecentDuplicateError extends Error {}

function cleanPayload(value: unknown): unknown {
  if (typeof value === "string") {
    return value
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
      .trim();
  }
  if (Array.isArray(value)) {
    return value.map(cleanPayload);
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, cleanPayload(item)]),
    );
  }
  return value;
}

function normalizedWebsite(value?: string): {
  value: string | null;
  valid: boolean;
} {
  const candidate = value?.trim();
  if (!candidate) {
    return { value: null, valid: true };
  }

  try {
    const withProtocol = /^https?:\/\//i.test(candidate)
      ? candidate
      : `https://${candidate}`;
    const parsed = new URL(withProtocol);
    if (
      (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
      !parsed.hostname ||
      parsed.username ||
      parsed.password
    ) {
      return { value: null, valid: false };
    }
    return { value: parsed.toString(), valid: true };
  } catch {
    return { value: null, valid: false };
  }
}

function clientIp(req: Request): string {
  return req.ip || req.socket.remoteAddress || "unknown";
}

function respondWithFieldError(
  res: Response,
  field: string,
  message: string,
): void {
  res.status(400).json({
    error: "Revisa la información marcada e inténtalo de nuevo.",
    fieldErrors: { [field]: message },
  });
}

async function insertSubmission(
  values: InsertSubmission,
): Promise<Submission> {
  const lockKey = [
    values.type,
    values.email.trim().toLowerCase(),
    values.company.trim().toLocaleLowerCase(),
  ].join("\u0000");
  const cutoff = new Date(Date.now() - DUPLICATE_WINDOW_MS);

  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`,
    );

    const existing = await tx
      .select({ id: submissionsTable.id })
      .from(submissionsTable)
      .where(
        and(
          eq(submissionsTable.type, values.type),
          sql`lower(${submissionsTable.email}) = ${values.email.trim().toLowerCase()}`,
          sql`lower(${submissionsTable.company}) = ${values.company.trim().toLowerCase()}`,
          gt(submissionsTable.createdAt, cutoff),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      throw new RecentDuplicateError("Recent duplicate submission");
    }

    const [created] = await tx
      .insert(submissionsTable)
      .values(values)
      .returning();
    return created;
  });
}

function successReceipt(
  res: Response,
  submission: Awaited<ReturnType<typeof insertSubmission>>,
  type: "BUYER" | "PROVIDER",
): void {
  const body = {
    id: submission.id,
    type,
    status: submission.status,
    createdAt: submission.createdAt.toISOString(),
  };

  if (type === "BUYER") {
    res.status(201).json(SubmitBuyerResponse.parse(body));
  } else {
    res.status(201).json(SubmitProviderResponse.parse(body));
  }
}

router.get("/public-config", (_req, res): void => {
  res.json(
    GetPublicConfigResponse.parse({
      contactEmail: process.env.CONTACT_EMAIL?.trim() || null,
      gaMeasurementId: process.env.GA_MEASUREMENT_ID?.trim() || null,
    }),
  );
});

router.post("/submissions/buyer", async (req, res): Promise<void> => {
  if (!allowRequest(`public-submission:${clientIp(req)}`, 5, 60 * 60 * 1000)) {
    res.status(429).json({
      error: "Recibimos varias solicitudes desde esta conexión. Inténtalo más tarde.",
    });
    return;
  }

  const parsed = SubmitBuyerBody.safeParse(cleanPayload(req.body));
  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    req.log.warn(
      { fields: Object.keys(fieldErrors) },
      "Invalid buyer submission",
    );
    res.status(400).json({
      error: "Revisa la información marcada e inténtalo de nuevo.",
      fieldErrors,
    });
    return;
  }

  if (parsed.data.honeypot) {
    res.status(201).json(
      SubmitBuyerResponse.parse({
        id: 0,
        type: "BUYER",
        status: "NEW",
        createdAt: new Date().toISOString(),
      }),
    );
    return;
  }

  const website = normalizedWebsite(parsed.data.website);
  if (!website.valid) {
    respondWithFieldError(res, "website", "Ingresa una URL válida.");
    return;
  }

  const input = parsed.data;
  const values: InsertSubmission = {
    type: "BUYER",
    name: input.name,
    jobTitle: input.jobTitle,
    company: input.company,
    website: website.value,
    email: input.email.toLowerCase(),
    phone: input.phone,
    industry: input.industry,
    country: input.country,
    city: input.city || null,
    operatingRegions: null,
    description: input.description,
    timeline: input.timeline,
    budget: input.budget,
    productService: input.productService,
    problemSolved: null,
    targetIndustries: null,
    customerSize: null,
    averageTicket: null,
    idealCustomer: null,
    successFeeInterest: null,
    source: input.source || null,
    consent: true,
  };

  try {
    const created = await insertSubmission(values);
    await sendSubmissionEmails(created);
    successReceipt(res, created, "BUYER");
  } catch (error) {
    if (error instanceof RecentDuplicateError) {
      res.status(409).json({
        error: "Ya recibimos una solicitud reciente con estos datos. Si necesitas agregar información, contáctanos.",
      });
      return;
    }
    throw error;
  }
});

router.post("/submissions/provider", async (req, res): Promise<void> => {
  if (!allowRequest(`public-submission:${clientIp(req)}`, 5, 60 * 60 * 1000)) {
    res.status(429).json({
      error: "Recibimos varias solicitudes desde esta conexión. Inténtalo más tarde.",
    });
    return;
  }

  const parsed = SubmitProviderBody.safeParse(cleanPayload(req.body));
  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    req.log.warn(
      { fields: Object.keys(fieldErrors) },
      "Invalid provider submission",
    );
    res.status(400).json({
      error: "Revisa la información marcada e inténtalo de nuevo.",
      fieldErrors,
    });
    return;
  }

  if (parsed.data.honeypot) {
    res.status(201).json(
      SubmitProviderResponse.parse({
        id: 0,
        type: "PROVIDER",
        status: "NEW",
        createdAt: new Date().toISOString(),
      }),
    );
    return;
  }

  const website = normalizedWebsite(parsed.data.website);
  if (!website.valid) {
    respondWithFieldError(res, "website", "Ingresa una URL válida.");
    return;
  }

  const input = parsed.data;
  const values: InsertSubmission = {
    type: "PROVIDER",
    name: input.name,
    jobTitle: input.jobTitle,
    company: input.company,
    website: website.value,
    email: input.email.toLowerCase(),
    phone: input.phone,
    industry: input.industry,
    country: input.country,
    city: null,
    operatingRegions: input.operatingRegions,
    description: null,
    timeline: null,
    budget: null,
    productService: input.productService,
    problemSolved: input.problemSolved,
    targetIndustries: input.targetIndustries,
    customerSize: input.customerSize,
    averageTicket: input.averageTicket,
    idealCustomer: input.idealCustomer,
    successFeeInterest: input.successFeeInterest,
    source: null,
    consent: true,
  };

  try {
    const created = await insertSubmission(values);
    await sendSubmissionEmails(created);
    successReceipt(res, created, "PROVIDER");
  } catch (error) {
    if (error instanceof RecentDuplicateError) {
      res.status(409).json({
        error: "Ya recibimos un registro reciente con estos datos. Si necesitas agregar información, contáctanos.",
      });
      return;
    }
    throw error;
  }
});

export default router;