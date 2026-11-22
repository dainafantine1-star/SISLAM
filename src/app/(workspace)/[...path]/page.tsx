import { notFound } from 'next/navigation';
import { Workspace } from '@/components/Workspace';
const sections = [
  'painel',
  'empreendimentos',
  'processos',
  'analise',
  'documentos',
  'licencas',
  'condicionantes',
  'fiscalizacao',
  'denuncias',
  'notificacoes',
  'arquivo',
  'regras',
  'auditoria',
  'administracao',
  'conta',
];
export default async function Page({ params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  if (
    !sections.includes(path[0]) ||
    path.length > 2 ||
    (path.length === 2 && path[0] !== 'processos')
  )
    notFound();
  return <Workspace section={path[0]} caseId={path[1]} />;
}
