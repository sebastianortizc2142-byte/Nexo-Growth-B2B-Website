import { ReplitConnectors } from "@replit/connectors-sdk";
import nodemailer from "nodemailer";
import { logger } from "./logger";

const connectors = new ReplitConnectors();

type EmailMessage = {
  to: string;
  subject: string;
  text: string;
};

function getFromAddress(): string | null {
  return (
    process.env.EMAIL_FROM?.trim() ||
    process.env.SMTP_USER?.trim() ||
    null
  );
}

async function sendWithSmtp(
  message: EmailMessage,
  from: string,
): Promise<void> {
  const host = process.env.SMTP_HOST?.trim();
  const rawPort = process.env.SMTP_PORT?.trim();
  const user = process.env.SMTP_USER?.trim();
  const password = process.env.SMTP_PASSWORD;
  const port = rawPort ? Number(rawPort) : NaN;

  if (
    !host ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535 ||
    !user ||
    !password
  ) {
    throw new Error("SMTP configuration is incomplete");
  }

  const transport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass: password },
  });
  try {
    await transport.sendMail({
      from,
      to: message.to,
      subject: message.subject,
      text: message.text,
    });
  } finally {
    transport.close();
  }
}

async function sendWithResend(
  message: EmailMessage,
  from: string,
): Promise<void> {
  const response = await connectors.proxy("resend", "/emails", {
    method: "POST",
    body: {
      from,
      to: [message.to],
      subject: message.subject,
      text: message.text,
    },
  });

  if (!response.ok) {
    throw new Error(`Transactional email provider returned ${response.status}`);
  }
}

export async function sendTransactionalEmail(
  message: EmailMessage,
): Promise<void> {
  const from = getFromAddress();
  if (!from) {
    throw new Error("Email sender is not configured");
  }

  if (process.env.SMTP_HOST?.trim()) {
    await sendWithSmtp(message, from);
    return;
  }

  await sendWithResend(message, from);
}

export async function sendSubmissionEmails(
  submission: {
    type: "BUYER" | "PROVIDER";
    name: string;
    jobTitle: string;
    company: string;
    website: string | null;
    email: string;
    phone: string;
    industry: string;
    country: string;
    city: string | null;
    operatingRegions: string | null;
    description: string | null;
    timeline: string | null;
    budget: string | null;
    productService: string | null;
    problemSolved: string | null;
    targetIndustries: string | null;
    customerSize: string | null;
    averageTicket: string | null;
    idealCustomer: string | null;
    successFeeInterest: string | null;
    source: string | null;
  },
): Promise<void> {
  const adminEmail = process.env.ADMIN_EMAIL?.trim();
  if (!adminEmail) {
    logger.warn("Submission emails skipped: ADMIN_EMAIL is not configured");
    return;
  }

  const details = [
    ["Tipo", submission.type],
    ["Nombre", submission.name],
    ["Cargo", submission.jobTitle],
    ["Empresa", submission.company],
    ["Sitio web", submission.website],
    ["Email", submission.email],
    ["Teléfono", submission.phone],
    ["Industria", submission.industry],
    ["País", submission.country],
    ["Ciudad", submission.city],
    ["Cobertura", submission.operatingRegions],
    ["Producto o servicio", submission.productService],
    ["Necesidad", submission.description],
    ["Problema que resuelve", submission.problemSolved],
    ["Sectores objetivo", submission.targetIndustries],
    ["Tamaño de clientes", submission.customerSize],
    ["Ticket promedio", submission.averageTicket],
    ["Cliente ideal", submission.idealCustomer],
    ["Interés en success-fee", submission.successFeeInterest],
    ["Plazo", submission.timeline],
    ["Presupuesto", submission.budget],
    ["Origen", submission.source],
  ]
    .filter(([, value]) => value)
    .map(([label, value]) => `${label}: ${value}`)
    .join("\n");

  const confirmation =
    submission.type === "BUYER"
      ? "Solicitud recibida.\n\nAnalizaremos la información y nos pondremos en contacto contigo si identificamos un posible encaje."
      : "Empresa registrada.\n\nRevisaremos la información y te contactaremos cuando identifiquemos una oportunidad con posible encaje.";

  const messages: EmailMessage[] = [
    {
      to: adminEmail,
      subject: `Nueva solicitud ${submission.type} — ${submission.company}`,
      text: `Se recibió una solicitud en Nexo Growth.\n\n${details}`,
    },
    {
      to: submission.email,
      subject:
        submission.type === "BUYER"
          ? "Recibimos tu solicitud | Nexo Growth"
          : "Registro recibido | Nexo Growth",
      text: `${submission.name},\n\n${confirmation}\n\nNexo Growth\nB2B DEAL ORIGINATION`,
    },
  ];

  const results = await Promise.allSettled(
    messages.map((message) => sendTransactionalEmail(message)),
  );

  for (const result of results) {
    if (result.status === "rejected") {
      logger.warn(
        {
          errorName:
            result.reason instanceof Error
              ? result.reason.name
              : "UnknownEmailError",
        },
        "Submission email delivery failed",
      );
    }
  }
}