import Link from "next/link";
import { ArrowLeft, KeyRound, Mail, ShieldCheck, UserCog, UsersRound } from "lucide-react";
import { ProfileAvatar } from "@/components/profile-avatar";
import { DeleteActionForm } from "@/components/settings/delete-action-form";
import { SettingsActionForm } from "@/components/settings/action-form";
import { requireOwnerContext } from "@/lib/auth";
import { loadAgencyData } from "@/lib/data/agency";
import {
  createMemberAccessAction,
  deleteMemberAccessAction,
  resetMemberPinAction,
  updateMemberAccessAction,
} from "./actions";

const ROLE_LABELS = {
  owner: "Proprietário",
  admin: "Administrador",
  member: "Membro",
} as const;

export default async function AccessManagementPage() {
  const context = await requireOwnerContext();
  const { data } = await loadAgencyData(context);
  const activeCount = data.members.filter((member) => member.active).length;

  return (
    <>
      <Link className="back-link" href="/configuracoes"><ArrowLeft size={15} /> Voltar às configurações</Link>
      <header className="page-heading page-heading-actions">
        <div><span className="eyebrow">Administração do workspace</span><h1>Gestão de acessos</h1><p>Crie integrantes, defina permissões, suspenda acessos e redefina PINs.</p></div>
        <span className="heading-status"><ShieldCheck size={15} /> {activeCount} ativo(s) · somente proprietário</span>
      </header>

      <section className="access-management-layout">
        <div className="access-member-list">
          {data.members.map((member) => {
            const currentUser = member.id === context.userId;
            return (
              <article className="panel access-member-card" key={member.id}>
                <div className="access-member-heading">
                  <ProfileAvatar name={member.name} src={member.avatarUrl} size={46} />
                  <div><strong>{member.name}</strong><span><Mail size={12} />{member.email}</span></div>
                  <span className={`role-badge ${member.role}`}>{ROLE_LABELS[member.role]}</span>
                  <span className={`active-member ${member.active ? "" : "suspended"}`}><span />{member.active ? "Ativo" : "Suspenso"}</span>
                </div>

                <details className="access-editor" open={data.members.length === 1}>
                  <summary><UserCog size={14} /> Editar integrante</summary>
                  <SettingsActionForm action={updateMemberAccessAction.bind(null, member.id)} className="form-grid two" submitLabel="Salvar acesso" successMessage="Acesso atualizado.">
                    <label className="form-field full"><span>Nome completo</span><input className="input" name="full_name" defaultValue={member.name} minLength={2} maxLength={120} required /></label>
                    <label className="form-field"><span>Papel</span><select className="input" name="role" defaultValue={member.role}><option value="owner">Proprietário</option><option value="admin">Administrador</option><option value="member">Membro</option></select></label>
                    <label className="form-field"><span>Status</span><select className="input" name="status" defaultValue={member.active ? "active" : "suspended"}><option value="active">Ativo</option><option value="suspended">Suspenso</option></select></label>
                    {currentUser ? <p className="form-security-note full"><ShieldCheck size={14} /> Você pode atualizar seu nome aqui, mas não pode alterar o próprio papel ou status.</p> : null}
                  </SettingsActionForm>
                </details>

                {!currentUser ? (
                  <div className="access-security-actions">
                    <details>
                      <summary><KeyRound size={13} /> Redefinir PIN</summary>
                      <div className="access-pin-reset">
                        <p>O PIN anterior deixará de funcionar. O valor não será exibido novamente nem enviado ao log.</p>
                        <SettingsActionForm action={resetMemberPinAction.bind(null, member.id)} className="stacked-form" submitLabel="Redefinir PIN" pendingLabel="Redefinindo…" successMessage="PIN redefinido.">
                          <label className="form-field"><span>Novo PIN de seis dígitos</span><input className="input pin-field" name="pin" type="password" inputMode="numeric" autoComplete="new-password" pattern="[0-9]{6}" minLength={6} maxLength={6} required /></label>
                        </SettingsActionForm>
                      </div>
                    </details>
                    <DeleteActionForm action={deleteMemberAccessAction.bind(null, member.id)} itemLabel={`o acesso de ${member.name}`} description="O integrante perderá o acesso ao workspace e sua conta de autenticação será removida. Os registros de auditoria permanecerão." />
                  </div>
                ) : null}
                <p className="access-pin-state">{member.pinChangedAt ? `PIN configurado · alterado em ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(member.pinChangedAt))}` : "Sem PIN · acesso disponível apenas pelos provedores já vinculados"}</p>
              </article>
            );
          })}
        </div>

        <aside className="panel create-access-card">
          <div className="panel-heading"><div><span className="panel-icon blue"><UsersRound size={18} /></span><div><h2>Novo integrante</h2><p>O acesso fica disponível imediatamente</p></div></div></div>
          <SettingsActionForm action={createMemberAccessAction} className="stacked-form" submitLabel="Criar acesso" pendingLabel="Criando…" successMessage="Acesso criado.">
            <label className="form-field"><span>Nome completo</span><input className="input" name="full_name" minLength={2} maxLength={120} autoComplete="name" required placeholder="Ex.: Marina Costa" /></label>
            <label className="form-field"><span>E-mail</span><input className="input" name="email" type="email" autoComplete="email" required placeholder="marina@agencia.com" /></label>
            <label className="form-field"><span>PIN inicial</span><input className="input pin-field" name="pin" type="password" inputMode="numeric" autoComplete="new-password" pattern="[0-9]{6}" minLength={6} maxLength={6} required placeholder="6 dígitos" /></label>
            <label className="form-field"><span>Papel</span><select className="input" name="role" defaultValue="member"><option value="member">Membro · operação</option><option value="admin">Administrador · operação e financeiro</option><option value="owner">Proprietário · equipe e tudo mais</option></select></label>
          </SettingsActionForm>
          <div className="pin-security-note"><KeyRound size={16} /><p>Compartilhe o PIN inicial por um canal seguro. A pessoa poderá trocá-lo em <strong>Meu perfil</strong>.</p></div>
        </aside>
      </section>
    </>
  );
}
