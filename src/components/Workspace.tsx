'use client';
import { useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Leaf,
  LayoutDashboard,
  Building2,
  FolderOpen,
  ClipboardCheck,
  Files,
  FileBadge,
  CalendarCheck,
  ScanSearch,
  Megaphone,
  Mail,
  Archive,
  BookOpen,
  ShieldCheck,
  Settings2,
  LogOut,
  Menu,
  Search,
  Bell,
  ChevronDown,
  PanelLeftClose,
  HelpCircle,
  UserRound,
  Plus,
} from 'lucide-react';
import { api, useApi, ROLE_LABELS, Entity } from '@/lib/api';
import { Loading, ErrorBox, Button } from './ui';
import { Dashboard } from './dashboard';
import { ProcessList, CaseDetail } from './processes';
import {
  RegistryView,
  DocumentsView,
  LicensesView,
  ConditionsView,
  NoticesView,
  InspectionsView,
  ComplaintsView,
  RulesView,
  AuditView,
  AdministrationView,
  AccountView,
} from './views';
const nav = [
  {
    group: 'PRINCIPAL',
    items: [
      { id: 'painel', label: 'Visão geral', icon: LayoutDashboard, roles: ['*'] },
      {
        id: 'empreendimentos',
        label: 'Empreendimentos',
        icon: Building2,
        roles: [
          'applicant',
          'protocol',
          'analyst',
          'authority',
          'municipal_admin',
          'inspector',
          'supplier',
        ],
      },
      {
        id: 'processos',
        label: 'Processos',
        icon: FolderOpen,
        roles: [
          'applicant',
          'protocol',
          'analyst',
          'authority',
          'municipal_admin',
          'inspector',
          'supplier',
        ],
      },
      {
        id: 'analise',
        label: 'Análise técnica',
        icon: ClipboardCheck,
        roles: ['analyst', 'authority', 'protocol'],
      },
      {
        id: 'documentos',
        label: 'Documentos',
        icon: Files,
        roles: [
          'applicant',
          'protocol',
          'analyst',
          'authority',
          'municipal_admin',
          'inspector',
          'supplier',
        ],
      },
    ],
  },
  {
    group: 'ACOMPANHAMENTO',
    items: [
      {
        id: 'licencas',
        label: 'Licenças',
        icon: FileBadge,
        roles: [
          'applicant',
          'protocol',
          'analyst',
          'authority',
          'municipal_admin',
          'inspector',
          'supplier',
        ],
      },
      {
        id: 'condicionantes',
        label: 'Condicionantes',
        icon: CalendarCheck,
        roles: [
          'applicant',
          'protocol',
          'analyst',
          'authority',
          'municipal_admin',
          'inspector',
          'supplier',
        ],
      },
      {
        id: 'fiscalizacao',
        label: 'Fiscalização',
        icon: ScanSearch,
        roles: ['inspector', 'authority', 'analyst'],
      },
      {
        id: 'denuncias',
        label: 'Denúncias',
        icon: Megaphone,
        roles: ['ombudsman', 'inspector', 'authority'],
      },
      {
        id: 'notificacoes',
        label: 'Notificações',
        icon: Mail,
        roles: [
          'applicant',
          'protocol',
          'analyst',
          'authority',
          'municipal_admin',
          'inspector',
          'supplier',
        ],
      },
      {
        id: 'arquivo',
        label: 'Arquivo digital',
        icon: Archive,
        roles: [
          'applicant',
          'protocol',
          'analyst',
          'authority',
          'municipal_admin',
          'inspector',
          'supplier',
        ],
      },
    ],
  },
  {
    group: 'GESTÃO',
    items: [
      {
        id: 'regras',
        label: 'Regras e legislação',
        icon: BookOpen,
        roles: [
          'applicant',
          'protocol',
          'analyst',
          'authority',
          'municipal_admin',
          'inspector',
          'supplier',
        ],
      },
      {
        id: 'auditoria',
        label: 'Auditoria',
        icon: ShieldCheck,
        roles: ['municipal_admin', 'authority'],
      },
      { id: 'administracao', label: 'Administração', icon: Settings2, roles: ['municipal_admin'] },
    ],
  },
];
export function Workspace({ section, caseId }: { section: string; caseId?: string }) {
  const session = useApi('auth/me'),
    router = useRouter(),
    dialog = useRef<HTMLDialogElement>(null),
    [search, setSearch] = useState('');
  if (!session.data)
    return (
      <div className="boot">
        <Leaf size={36} />
        <Loading />
        <ErrorBox error={session.error} />
      </div>
    );
  const user = session.data.user,
    municipality = session.data.memberships.find((m: Entity) => m.id === user.municipalityId),
    active = nav.flatMap((n) => n.items).find((n) => n.id === section),
    authorized =
      section === 'conta' || active?.roles.includes('*') || active?.roles.includes(user.role);
  const links = (
    <>
      {nav.map((group) => (
        <div className="nav-group" key={group.group}>
          <p>{group.group}</p>
          {group.items
            .filter((item) => item.roles.includes('*') || item.roles.includes(user.role))
            .map((item) => (
              <Link
                key={item.id}
                href={'/' + item.id}
                className={section === item.id ? 'active' : ''}
                aria-current={section === item.id ? 'page' : undefined}
                onClick={() => dialog.current?.close()}
              >
                <item.icon size={19} />
                <span>{item.label}</span>
                {section === item.id && <span className="nav-active" />}
              </Link>
            ))}
        </div>
      ))}
    </>
  );
  const sidebar = (
    <>
      <Link href="/painel" className="brand">
        <span className="brand-mark">
          <Leaf size={24} />
        </span>
        <span>
          SISLAM<small>GESTÃO AMBIENTAL</small>
        </span>
      </Link>
      <div className="municipality-card">
        <span className="municipality-icon">
          <Building2 size={21} />
        </span>
        <div>
          <strong>{municipality?.name}</strong>
          <small>Secretaria de Meio Ambiente</small>
        </div>
      </div>
      <nav aria-label="Menu principal">{links}</nav>
      <div className="sidebar-footer">
        <div className="local-help">
          <HelpCircle size={18} />
          <span>
            Ambiente local<small>Dados demonstrativos</small>
          </span>
        </div>
        <Link href="/conta" className="profile">
          <span className="avatar">
            {user.name
              .split(' ')
              .map((n: string) => n[0])
              .slice(0, 2)
              .join('')}
          </span>
          <span>
            <strong>{user.name}</strong>
            <small>{ROLE_LABELS[user.role]}</small>
          </span>
          <Settings2 size={16} />
        </Link>
      </div>
    </>
  );
  return (
    <div className="app">
      <a className="skip-link" href="#conteudo">
        Ir para o conteúdo
      </a>
      <aside className="sidebar">{sidebar}</aside>
      <dialog
        ref={dialog}
        className="mobile-nav"
        onClick={(e) => {
          if (e.target === e.currentTarget) dialog.current?.close();
        }}
      >
        <Button
          variant="ghost"
          className="close-mobile"
          onClick={() => dialog.current?.close()}
          aria-label="Fechar menu"
        >
          <PanelLeftClose size={23} />
        </Button>
        {sidebar}
      </dialog>
      <div className="app-body">
        <header className="topbar">
          <div className="topbar-start">
            <Button
              variant="ghost"
              className="mobile-toggle"
              onClick={() => dialog.current?.showModal()}
              aria-label="Abrir menu"
            >
              <Menu size={22} />
            </Button>
            <span className="breadcrumb">
              Gestão ambiental <span>/</span> <strong>{active?.label || 'Minha conta'}</strong>
            </span>
          </div>
          <div className="topbar-actions">
            <form
              className="top-search"
              onSubmit={(e) => {
                e.preventDefault();
                router.push('/processos?q=' + encodeURIComponent(search));
              }}
            >
              <Search size={17} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar um processo…"
                aria-label="Buscar um processo"
              />
              <kbd>↵</kbd>
            </form>
            <span className="environment">Demonstração</span>
            <Link
              href="/condicionantes"
              className="icon-link"
              aria-label="Ver agenda de condicionantes"
            >
              <Bell size={20} />
            </Link>
            <Button
              variant="ghost"
              onClick={async () => {
                await api('auth/logout', {});
                window.location.assign('/login');
              }}
              aria-label="Sair do sistema"
            >
              <LogOut size={18} />
            </Button>
          </div>
        </header>
        <div className="demo-bar">
          <ShieldCheck size={15} />
          <span>Ambiente demonstrativo · regras e atos sem validade jurídica.</span>
          {user.role === 'supplier' && <strong>Suporte temporário · somente leitura</strong>}
        </div>
        <main id="conteudo" className="main-content">
          {!authorized ? (
            <div className="card">
              <h1>Acesso restrito</h1>
              <p>Seu perfil não tem acesso a esta seção.</p>
              <Link href="/painel" className="button primary">
                Voltar ao painel
              </Link>
            </div>
          ) : (
            <>
              {section === 'painel' && <Dashboard user={user} />}
              {['processos', 'analise', 'arquivo'].includes(section) &&
                (caseId ? (
                  <CaseDetail user={user} caseId={caseId} />
                ) : (
                  <ProcessList user={user} mode={section} />
                ))}
              {section === 'empreendimentos' && <RegistryView user={user} />}
              {section === 'documentos' && <DocumentsView user={user} />}
              {section === 'licencas' && <LicensesView user={user} />}
              {section === 'condicionantes' && <ConditionsView user={user} />}
              {section === 'notificacoes' && <NoticesView user={user} />}
              {section === 'fiscalizacao' && <InspectionsView user={user} />}
              {section === 'denuncias' && <ComplaintsView user={user} />}
              {section === 'regras' && <RulesView user={user} />}
              {section === 'auditoria' && <AuditView />}
              {section === 'administracao' && <AdministrationView user={user} />}
              {section === 'conta' && <AccountView user={user} />}
            </>
          )}
          <footer className="workspace-footer">
            <span>SISLAM · Gestão ambiental municipal</span>
            <span>
              {municipality?.name} / {municipality?.state} · Versão 0.1
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}
