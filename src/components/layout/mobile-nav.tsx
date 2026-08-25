"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Columns3, FolderKanban, LayoutDashboard, Menu, Plus } from "lucide-react";

const items = [
  { href: "/", label: "Início", icon: LayoutDashboard },
  { href: "/projetos", label: "Projetos", icon: FolderKanban },
  { href: "/projetos/novo", label: "Novo", icon: Plus, primary: true },
  { href: "/quadro", label: "Kanban", icon: Columns3 },
  { href: "/configuracoes", label: "Mais", icon: Menu },
];

export function MobileNav() {
  const pathname = usePathname();
  return (
    <nav className="mobile-nav" aria-label="Navegação para celular">
      {items.map((item) => {
        const Icon = item.icon;
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link key={item.label} href={item.href} className={`${active ? "active" : ""} ${item.primary ? "primary" : ""}`}>
            <Icon aria-hidden="true" size={item.primary ? 22 : 20} />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
