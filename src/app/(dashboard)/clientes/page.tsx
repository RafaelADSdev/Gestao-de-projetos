import { requireAuthContext } from "@/lib/auth";
import { loadAgencyData } from "@/lib/data/agency";
import { buildClientList } from "@/lib/data/view-models";
import { ClientsManager } from "@/components/clients/clients-manager";

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const context = await requireAuthContext();
  const { data } = await loadAgencyData(context);
  const query = (await searchParams).q?.trim() ?? "";
  const clients = buildClientList(data);

  return <ClientsManager clients={clients} initialQuery={query} />;
}
