import { redirect } from "next/navigation";

type BacklogFilters = {
  q?: string;
  responsavel?: string;
  fluxo?: string;
};

export default async function BacklogPage({ searchParams }: { searchParams: Promise<BacklogFilters> }) {
  const filters = await searchParams;
  const params = new URLSearchParams({ visao: "backlog" });
  if (filters.fluxo) params.set("fluxo", filters.fluxo);
  if (filters.q) params.set("q", filters.q);
  if (filters.responsavel) params.set("responsavel", filters.responsavel);
  redirect(`/quadro?${params.toString()}`);
}
