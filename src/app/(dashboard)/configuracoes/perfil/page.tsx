import Link from "next/link";
import { ArrowLeft, Camera, KeyRound, ShieldCheck, UserRound } from "lucide-react";
import { ProfileAvatar } from "@/components/profile-avatar";
import { SettingsActionForm } from "@/components/settings/action-form";
import { requireAuthContext } from "@/lib/auth";
import { loadAgencyData } from "@/lib/data/agency";
import { changeOwnPinAction, updateOwnProfileAction } from "./actions";

export default async function ProfileSettingsPage() {
  const context = await requireAuthContext();
  const { data } = await loadAgencyData(context);
  const member = data.members.find((item) => item.id === context.userId);
  const hasPin = Boolean(member?.pinChangedAt);

  return (
    <>
      <Link className="back-link" href="/configuracoes"><ArrowLeft size={15} /> Voltar às configurações</Link>
      <header className="page-heading">
        <div><span className="eyebrow">Conta pessoal</span><h1>Meu perfil</h1><p>Escolha como seu nome e sua foto aparecem para a equipe e gerencie o PIN de acesso.</p></div>
      </header>

      <section className="profile-settings-layout">
        <article className="panel profile-identity-card">
          <div className="profile-avatar-preview"><ProfileAvatar name={context.name} src={context.avatarUrl} size={92} /><span><Camera size={15} /> JPG, PNG ou WebP · até 2 MB</span></div>
          <div><span className="eyebrow">Identidade na Central</span><h2>{context.name}</h2><p>{context.email}</p><span className={`role-badge ${context.role}`}>{context.role === "owner" ? "Proprietário" : context.role === "admin" ? "Administrador" : "Membro"}</span></div>
        </article>

        <div className="profile-settings-main">
          <article className="panel settings-card">
            <div className="panel-heading"><div><span className="panel-icon blue"><UserRound size={18} /></span><div><h2>Nome e foto</h2><p>As alterações aparecem no cabeçalho, equipe e responsáveis</p></div></div></div>
            <SettingsActionForm action={updateOwnProfileAction} className="stacked-form profile-form" submitLabel="Salvar perfil" pendingLabel="Enviando…" successMessage="Perfil atualizado." encType="multipart/form-data">
              <label className="form-field"><span>Nome completo</span><input className="input" name="full_name" defaultValue={context.name} minLength={2} maxLength={120} autoComplete="name" required /></label>
              <label className="form-field"><span>Foto de perfil</span><input className="input file-input" name="avatar" type="file" accept="image/jpeg,image/png,image/webp" /></label>
              {context.avatarUrl ? <label className="simple-check"><input name="remove_avatar" type="checkbox" /> Remover a foto atual</label> : null}
              <label className="form-field"><span>E-mail de acesso</span><input className="input" value={context.email} readOnly /></label>
            </SettingsActionForm>
          </article>

          <article className="panel settings-card">
            <div className="panel-heading"><div><span className="panel-icon amber"><KeyRound size={18} /></span><div><h2>{hasPin ? "Alterar PIN" : "Criar PIN"}</h2><p>{hasPin ? "Use o PIN atual para confirmar a mudança" : "Adicione uma alternativa ao login com Google"}</p></div></div><span className={`integration-status ${hasPin ? "connected" : ""}`}>{hasPin ? "Configurado" : "Ainda não criado"}</span></div>
            <SettingsActionForm action={changeOwnPinAction} className="form-grid two pin-change-form" submitLabel={hasPin ? "Alterar PIN" : "Criar PIN"} pendingLabel="Protegendo…" successMessage="PIN atualizado.">
              {hasPin ? <label className="form-field full"><span>PIN atual</span><input className="input pin-field" name="current_pin" type="password" inputMode="numeric" autoComplete="current-password" pattern="[0-9]{6}" minLength={6} maxLength={6} required /></label> : null}
              <label className="form-field"><span>Novo PIN</span><input className="input pin-field" name="new_pin" type="password" inputMode="numeric" autoComplete="new-password" pattern="[0-9]{6}" minLength={6} maxLength={6} required /></label>
              <label className="form-field"><span>Confirmar PIN</span><input className="input pin-field" name="pin_confirmation" type="password" inputMode="numeric" autoComplete="new-password" pattern="[0-9]{6}" minLength={6} maxLength={6} required /></label>
            </SettingsActionForm>
            <div className="pin-security-note"><ShieldCheck size={16} /><p><strong>O PIN nunca entra no banco operacional ou no log.</strong> Seis dígitos são mais fáceis de adivinhar que uma senha longa; não reutilize códigos bancários e mantenha o login Google como opção preferencial.</p></div>
          </article>
        </div>
      </section>
    </>
  );
}
