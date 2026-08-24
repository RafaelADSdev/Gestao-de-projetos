import Link from "next/link";
import { Check, Command } from "lucide-react";
import { GoogleSignIn } from "@/components/auth/google-sign-in";
import { PinSignIn } from "@/components/auth/pin-sign-in";
import { APP_NAME_SUFFIX, APP_SHORT_NAME } from "@/lib/domain/constants";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export default function SignInPage() {
  const configured = isSupabaseConfigured();
  return (
    <main className="login-page">
      <section className="login-story">
        <Link href="/" className="brand light"><span className="brand-mark"><Command size={21} /></span><span><strong>{APP_SHORT_NAME}</strong><small>{APP_NAME_SUFFIX}</small></span></Link>
        <div className="login-copy">
          <span className="eyebrow light">Operação sob controle</span>
          <h1>Menos abas abertas.<br />Mais projetos entregues.</h1>
          <p>Prazos, responsáveis, links, custos e renovações organizados no mesmo lugar.</p>
          <ul>
            <li><Check size={17} /> Veja prioridades em segundos</li>
            <li><Check size={17} /> Receba prazos no Google Agenda</li>
            <li><Check size={17} /> Proteja valores por nível de acesso</li>
          </ul>
        </div>
        <p className="login-quote">“A próxima ação de cada projeto sempre à vista.”</p>
      </section>
      <section className="login-form-wrap">
        <div className="login-card">
          <span className="eyebrow">Acesso da equipe</span>
          <h2>Entre no seu workspace</h2>
          <p>Use seu e-mail e PIN da equipe ou continue com a conta Google autorizada.</p>
          {configured ? <><PinSignIn /><div className="login-divider"><span>ou</span></div><GoogleSignIn /></> : (
            <div className="demo-login">
              <p>O banco ainda não foi conectado. Você pode conhecer a interface com dados de exemplo.</p>
              <Link href="/" className="button button-primary button-block">Explorar demonstração <ArrowRightIcon /></Link>
            </div>
          )}
          <small className="privacy-note">Acesso restrito aos integrantes cadastrados. O PIN é protegido pelo Supabase Auth e nunca é salvo nos campos da Central.</small>
        </div>
      </section>
    </main>
  );
}

function ArrowRightIcon() {
  return <span aria-hidden="true">→</span>;
}
