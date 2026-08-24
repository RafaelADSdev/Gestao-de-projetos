import { AppShell } from "@/components/layout/app-shell";
import { requireAuthContext } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const context = await requireAuthContext();
  return <AppShell context={context}>{children}</AppShell>;
}
