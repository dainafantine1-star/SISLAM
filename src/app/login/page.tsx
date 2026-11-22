'use client';
import { useState } from 'react';
import { Leaf, ShieldCheck, FolderCheck, Layers, Eye, EyeOff } from 'lucide-react';
import { api, field, ROLE_LABELS } from '@/lib/api';
import { ActionForm, Field, Select, Button, ErrorBox } from '@/components/ui';
const profiles = [
  ['admin', 'municipal_admin'],
  ['requerente', 'applicant'],
  ['protocolo', 'protocol'],
  ['tecnico', 'analyst'],
  ['autoridade', 'authority'],
  ['fiscal', 'inspector'],
  ['ouvidoria', 'ombudsman'],
  ['fornecedor', 'supplier'],
];
export default function Login() {
  const [email, setEmail] = useState('admin@demo.sislam.test'),
    [show, setShow] = useState(false),
    [mfa, setMfa] = useState(false),
    [configured, setConfigured] = useState(false),
    [secret, setSecret] = useState('');
  return (
    <main className="login-page">
      <section className="login-art">
        <a className="brand light" href="/login">
          <span className="brand-mark">
            <Leaf size={25} />
          </span>
          <span>
            SISLAM<small>GESTÃO AMBIENTAL</small>
          </span>
        </a>
        <div className="login-message">
          <span className="eyebrow">MUNICÍPIOS MAIS SUSTENTÁVEIS</span>
          <h1>
            Cuidar do ambiente
            <br />
            começa com uma
            <br />
            <em>gestão melhor.</em>
          </h1>
          <p>
            Do primeiro requerimento ao acompanhamento das condicionantes, cada etapa no lugar
            certo.
          </p>
          <div className="login-benefits">
            <span>
              <FolderCheck size={20} />
              Processos conectados
            </span>
            <span>
              <ShieldCheck size={20} />
              Decisões rastreáveis
            </span>
            <span>
              <Layers size={20} />
              Histórico preservado
            </span>
          </div>
        </div>
        <div className="login-bottom">Sistema Inteligente de Licenciamento e Gestão Ambiental</div>
        <div className="landscape" aria-hidden="true">
          <div />
          <div />
          <div />
        </div>
      </section>
      <section className="login-form">
        <div className="login-inner">
          <span className="tag">AMBIENTE DE DEMONSTRAÇÃO</span>
          <h2>{mfa ? 'Confirme sua identidade' : 'Bem-vindo ao SISLAM'}</h2>
          <p>
            {mfa
              ? 'Use seu aplicativo autenticador para continuar.'
              : 'Acesse o ambiente de gestão ambiental do seu município.'}
          </p>
          {!mfa ? (
            <>
              <Select
                label="Perfil da demonstração"
                onChange={(e) => setEmail(e.target.value)}
                value={email}
              >
                {profiles.map(([name, role]) => (
                  <option key={name} value={name + '@demo.sislam.test'}>
                    {ROLE_LABELS[role]}
                  </option>
                ))}
              </Select>
              <ActionForm
                label="Entrar no sistema"
                submit={async (f) => {
                  const result = await api('auth/login', { email, password: field(f, 'password') });
                  if (result.mfaRequired) {
                    setMfa(true);
                    setConfigured(result.mfaConfigured);
                  } else window.location.assign('/painel');
                }}
              >
                <Field
                  label="E-mail"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="username"
                />
                <div className="password-field">
                  <Field
                    label="Senha"
                    name="password"
                    type={show ? 'text' : 'password'}
                    required
                    maxLength={200}
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    aria-label={show ? 'Ocultar senha' : 'Mostrar senha'}
                    onClick={() => setShow(!show)}
                  >
                    {show ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </ActionForm>
              <p className="login-help">
                A senha dos perfis fictícios está no arquivo <strong>ACESSO-LOCAL.txt</strong>,
                dentro da pasta do sistema.
              </p>
            </>
          ) : (
            <>
              {!configured && !secret && (
                <ActionForm
                  label="Configurar autenticador"
                  submit={async (f) => {
                    const result = await api('auth/mfa/setup', { password: field(f, 'password') });
                    setSecret(result.secret);
                  }}
                >
                  <Field
                    name="password"
                    label="Confirme sua senha"
                    type="password"
                    required
                    autoComplete="current-password"
                  />
                </ActionForm>
              )}
              {secret && (
                <div className="callout">
                  <p>Adicione uma conta TOTP no seu autenticador com esta chave:</p>
                  <code className="break">{secret}</code>
                </div>
              )}
              {(configured || secret) && (
                <ActionForm
                  label="Confirmar acesso"
                  submit={async (f) => {
                    await api('auth/mfa/verify', { code: field(f, 'code') });
                    window.location.assign('/painel');
                  }}
                >
                  <Field
                    name="code"
                    label="Código de seis dígitos"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    required
                    autoComplete="one-time-code"
                  />
                </ActionForm>
              )}
            </>
          )}
          <div className="login-note">
            <ShieldCheck size={18} />
            <span>
              Dados fictícios e atos sem validade jurídica. A validação das normas e integrações
              oficiais é uma etapa posterior.
            </span>
          </div>
        </div>
        <footer>
          Itaberaba / BA <span>•</span> SISLAM 0.1
        </footer>
      </section>
    </main>
  );
}
