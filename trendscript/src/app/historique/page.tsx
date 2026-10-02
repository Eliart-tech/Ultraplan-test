import type { Metadata } from "next";
import { HistoryView } from "@/components/history/history-view";
import { Container } from "@/components/ui/container";

export const metadata: Metadata = {
  title: "Historique",
  description: "Vos scripts et analyses TrendScript enregistrés dans ce navigateur.",
};

export default function HistoryPage() {
  return (
    <Container className="py-8 sm:py-12">
      <HistoryView />
    </Container>
  );
}
