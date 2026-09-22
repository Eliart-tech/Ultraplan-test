import { contactSchema, subjectLabels } from "@/lib/contact-schema";
import { site } from "@/lib/site";

/**
 * Contact endpoint.
 *
 * Delivery is provider-agnostic: set RESEND_API_KEY and CONTACT_TO_EMAIL and the
 * message is e-mailed; leave them unset (local dev, preview) and the submission
 * is logged instead, so the form is never broken by missing configuration.
 */

export const runtime = "nodejs";
// Submissions must never be served from a cache.
export const dynamic = "force-dynamic";

const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 5;

/**
 * Per-instance rate limit. It is intentionally simple: it blunts casual abuse
 * from a single address without adding infrastructure. Serverless instances do
 * not share this map, so put a WAF or a shared store in front for hard limits.
 */
const hits = new Map<string, number[]>();

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((at) => now - at < WINDOW_MS);
  recent.push(now);
  hits.set(key, recent);

  // Keep the map from growing without bound on a long-lived instance.
  if (hits.size > 5_000) {
    for (const [entry, times] of hits) {
      if (times.every((at) => now - at >= WINDOW_MS)) hits.delete(entry);
    }
  }

  return recent.length > MAX_PER_WINDOW;
}

function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return (
    forwarded?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "inconnu"
  );
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export async function POST(request: Request) {
  if (isRateLimited(clientKey(request))) {
    return Response.json(
      {
        ok: false,
        error:
          "Trop de demandes envoyées depuis cette adresse. Réessayez dans une heure ou écrivez-nous directement.",
      },
      { status: 429 },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json(
      { ok: false, error: "Requête invalide." },
      { status: 400 },
    );
  }

  const parsed = contactSchema.safeParse(payload);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0] ?? "form");
      fields[field] ??= issue.message;
    }
    return Response.json(
      { ok: false, error: "Le formulaire contient des erreurs.", fields },
      { status: 422 },
    );
  }

  const data = parsed.data;

  // A filled honeypot is a bot: answer 200 so it never learns it was caught.
  if (data.website) {
    return Response.json({ ok: true });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.CONTACT_TO_EMAIL ?? site.email;
  const from = process.env.CONTACT_FROM_EMAIL ?? `Site Maiven <onboarding@resend.dev>`;

  if (!apiKey) {
    console.info("[contact] nouvelle demande (envoi e-mail non configuré)", {
      name: data.name,
      email: data.email,
      company: data.company,
      subject: data.subject,
    });
    return Response.json({ ok: true });
  }

  const html = `
    <h2>Nouvelle demande depuis le site</h2>
    <p><strong>Sujet :</strong> ${escapeHtml(subjectLabels[data.subject])}</p>
    <p><strong>Nom :</strong> ${escapeHtml(data.name)}</p>
    <p><strong>E-mail :</strong> ${escapeHtml(data.email)}</p>
    <p><strong>Entreprise :</strong> ${escapeHtml(data.company ?? "—")}</p>
    <p><strong>Téléphone :</strong> ${escapeHtml(data.phone ?? "—")}</p>
    <hr />
    <p>${escapeHtml(data.message).replaceAll("\n", "<br />")}</p>
  `;

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        reply_to: data.email,
        subject: `[Site] ${subjectLabels[data.subject]} — ${data.name}`,
        html,
      }),
    });

    if (!response.ok) {
      console.error("[contact] échec de l'envoi", response.status, await response.text());
      return Response.json(
        {
          ok: false,
          error: `L'envoi a échoué. Écrivez-nous directement à ${site.email}.`,
        },
        { status: 502 },
      );
    }
  } catch (error) {
    console.error("[contact] erreur réseau", error);
    return Response.json(
      {
        ok: false,
        error: `L'envoi a échoué. Écrivez-nous directement à ${site.email}.`,
      },
      { status: 502 },
    );
  }

  return Response.json({ ok: true });
}
