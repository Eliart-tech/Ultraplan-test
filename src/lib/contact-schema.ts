import { z } from "zod";

/**
 * Shared between the browser form and the route handler, so the rules that the
 * user sees are exactly the rules the server enforces.
 */
export const contactSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Indiquez votre nom (2 caractères minimum).")
    .max(80, "Ce nom est trop long."),
  email: z
    .string()
    .trim()
    .min(1, "L'adresse e-mail est obligatoire.")
    .max(160, "Cette adresse est trop longue.")
    .email("Cette adresse e-mail ne semble pas valide."),
  company: z.string().trim().max(120, "Ce nom d'entreprise est trop long.").optional(),
  phone: z
    .string()
    .trim()
    .max(30, "Ce numéro est trop long.")
    .regex(/^[+()\d\s.-]*$/, "Ce numéro de téléphone ne semble pas valide.")
    .optional(),
  subject: z.enum(["audit", "agents", "automatisation", "vocal", "autre"]),
  message: z
    .string()
    .trim()
    .min(20, "Décrivez votre besoin en quelques lignes (20 caractères minimum).")
    .max(4000, "Ce message est trop long (4 000 caractères maximum)."),
  consent: z.literal(true, {
    message: "Votre accord est nécessaire pour traiter la demande.",
  }),
  // Honeypot: invisible to humans, irresistible to naive bots.
  website: z.string().max(0).optional(),
});

export type ContactInput = z.infer<typeof contactSchema>;

export const subjectLabels: Record<ContactInput["subject"], string> = {
  audit: "Réserver un audit gratuit",
  agents: "Déployer un agent IA",
  automatisation: "Automatiser un process",
  vocal: "Mettre en place un assistant vocal",
  autre: "Autre demande",
};
