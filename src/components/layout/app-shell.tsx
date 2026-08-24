import Link from "next/link";
import { Bell, ChevronDown, Plus, Search } from "lucide-react";
import type { AuthContext } from "@/lib/auth";
import { canSeeFinance } from "@/lib/auth";
import { APP_MONOGRAM, APP_SHORT_NAME } from "@/lib/domain/constants";
import { BrandLockup, BrandMark } from "@/components/brand-lockup";
import { ProfileAvatar } from "@/components/profile-avatar";
import { MobileNav } from "./mobile-nav";
import { SidebarNav } from "./sidebar-nav";

export function AppShell({ context, children }: { context: AuthContext; children: React.ReactNode }) {
  const finance = canSeeFinance(context.role);
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <BrandLockup label={`${context.workspaceName} — início`} />
        <div className="workspace-chip">
          <span className="workspace-avatar">{APP_MONOGRAM}</span>
          <span><strong>{context.workspaceName}</strong><small>Workspace principal</small></span>
          <ChevronDown size={15} aria-hidden="true" />
        </div>
        <SidebarNav canSeeFinance={finance} />
        <div className="sidebar-foot">
          <div className="progress-copy"><span>Ambiente privado</span><strong>Protegido</strong></div>
          <div className="progress-track"><span style={{ width: "100%" }} /></div>
          <p>RLS por workspace e segredos fora dos projetos.</p>
        </div>
      </aside>
      <div className="app-content">
        {context.demo && (
          <div className="demo-banner" role="status">
            <span><strong>Modo demonstração</strong> — conecte o Supabase para salvar alterações e restringir o acesso.</span>
            <Link href="/configuracoes">Configurar</Link>
          </div>
        )}
        <header className="topbar">
          <div className="mobile-brand"><BrandMark size="sm" /><strong>{APP_SHORT_NAME}</strong></div>
          <form className="global-search" action="/projetos">
            <Search size={18} aria-hidden="true" />
            <label className="sr-only" htmlFor="global-project-search">Buscar projetos</label>
            <input id="global-project-search" name="q" type="search" placeholder="Buscar projeto ou cliente…" />
          </form>
          <div className="topbar-actions">
            <Link href="/projetos/novo" className="button button-primary desktop-create"><Plus size={17} /> Novo projeto</Link>
            <Link href="/calendario" className="icon-button" aria-label="Ver prazos no calendário"><Bell size={19} /></Link>
            <div className="user-menu">
              <Link href="/configuracoes/perfil" className="user-avatar-link" aria-label="Abrir meu perfil"><ProfileAvatar name={context.name} src={context.avatarUrl} size={34} /></Link>
              <span><strong>{context.name}</strong><small>{context.role === "owner" ? "Proprietário" : context.role === "admin" ? "Administrador" : "Membro"}</small></span>
              {!context.demo && (
                <form action="/auth/signout" method="post"><button type="submit" className="quiet-link">Sair</button></form>
              )}
            </div>
          </div>
        </header>
        <main className="page-wrap">{children}</main>
      </div>
      <MobileNav />
    </div>
  );
}
