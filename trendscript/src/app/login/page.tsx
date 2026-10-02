import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm, LoginFormFallback } from "@/components/auth/login-form";
import { LogoMark } from "@/components/layout/logo";
import { Card } from "@/components/ui/card";
import { Container } from "@/components/ui/container";

export const metadata: Metadata = {
  title: "Connexion",
  description: "Connexion à votre espace TrendScript.",
};

const code = "rounded-md border border-line bg-surface-2 px-1.5 py-px font-mono text-[0.8em] font-medium text-ink";

export default function LoginPage() {
  return (
    <Container size="sm" className="flex min-h-[calc(100dvh-12rem)] items-center justify-center py-10 sm:py-16">
      <div className="w-full max-w-sm animate-fade-in">
        <Card elevated className="px-6 pt-8 pb-7 sm:px-8">
          <div className="flex flex-col items-center text-center">
            <LogoMark size={48} />
            <h1 className="mt-5 text-2xl font-semibold tracking-[-0.03em] text-ink">Connexion</h1>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Cet espace TrendScript est protégé. Saisissez le mot de passe pour retrouver vos tendances et vos scripts.
            </p>
          </div>
          <div className="mt-7">
            <Suspense fallback={<LoginFormFallback />}>
              <LoginForm />
            </Suspense>
          </div>
        </Card>
        <p className="mt-5 px-2 text-center text-xs leading-relaxed text-muted">
          Mot de passe oublié ? Il est défini par la variable <code className={code}>APP_PASSWORD</code> du serveur :
          fichier <code className={code}>.env.local</code> en local, tableau de bord de l&apos;hébergeur en ligne.
        </p>
      </div>
    </Container>
  );
}
