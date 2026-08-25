"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  Columns3,
  FolderKanban,
  LayoutDashboard,
  Settings,
  Users,
  WalletCards,
} from "lucide-react";

const items = [
  { href: "/", label: "Visão geral", icon: LayoutDashboard },
  { href: "/projetos", label: "Projetos", icon: FolderKanban },
  { href: "/quadro", label: "Kanban", icon: Columns3 },
  { href: "/calendario", label: "Calendário", icon: CalendarDays },
  { href: "/clientes", label: "Clientes", icon: Users },
  { href: "/financeiro", label: "Financeiro", icon: WalletCards, finance: true },
  { href: "/configuracoes", label: "Configurações", icon: Settings },
];

function isActive(pathname: string, href: string) {
  if (href === "/quadro") return pathname === "/quadro" || pathname.startsWith("/backlog");
  return href === "/" ? pathname === href : pathname.startsWith(href);
}

export function SidebarNav({ canSeeFinance }: { canSeeFinance: boolean }) {
  const pathname = usePathname();
  return (
    <nav className="sidebar-nav" aria-label="Navegação principal">
      {items.filter((item) => !item.finance || canSeeFinance).map((item) => {
        const Icon = item.icon;
        const active = isActive(pathname, item.href);
        return (
          <Link key={item.href} href={item.href} className={active ? "active" : ""} aria-current={active ? "page" : undefined}>
            <Icon aria-hidden="true" size={19} strokeWidth={2} />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
