# Demonstração online

A preparação atual usa [cadastros manuais](PREENCHIMENTO-MANUAL.md). Os exemplos anteriores são arquivados sem apagar originais ou auditoria; novas inicializações não criam empresas, processos ou regras de exemplo. O cenário registrado abaixo documenta a verificação histórica da implantação.

Publicação validada em `https://sislam-of9c.vercel.app`: TypeScript, 33 testes, compilação e 11 verificações no Edge aprovados, incluindo isolamento municipal, leitura de anexo privado, parecer, licença-modelo, condicionante e auditoria. Evidências sem credenciais em [verificacao/online.json](verificacao/online.json).

O SISLAM pode executar a demonstração na Vercel. A interface e a API NestJS compartilham o domínio: `src/pages/api/[...path].ts` inicializa o Nest sem abrir uma porta e mantém autenticação, verificação de origem, perfis, RLS e auditoria. O PostgreSQL e os anexos precisam de armazenamento persistente externo. A base local e suas credenciais são independentes e permanecem preservadas.

Esta implantação continua restrita a dados fictícios e atos sem validade jurídica. Não habilita o modo operacional, assinatura, comunicação ou publicação oficial. O antivírus continua identificado como não executado quando não há provedor configurado.

## Configuração

1. Vincule a pasta ao projeto e à equipe corretos na Vercel. Confira o endereço e os identificadores antes da publicação.
2. Provisione PostgreSQL (por exemplo, Neon no plano gratuito) e um Blob privado. Configure `DATABASE_URL` com conexão agrupada, `BLOB_READ_WRITE_TOKEN` ou `BLOB_STORE_ID` com OIDC, `SISLAM_DEMO=1`, `WEB_ORIGIN` com a origem HTTPS exata e `APP_ENCRYPTION_KEY` com um segredo aleatório de pelo menos 32 caracteres. Preserve a chave para ler os anexos existentes. Não copie segredos ou dados da instalação local.
3. Configure `SISLAM_DEMO_PASSWORD` como Secret na Vercel, com uma senha aleatória de pelo menos 20 caracteres, entregue somente no arquivo privado `ACESSO-ONLINE.txt`. Preserve a chave de cifragem na Vercel, sem copiá-la para arquivos locais. Na primeira publicação, passe apenas o sinalizador de compilação `--build-env SISLAM_INITIALIZE_DEMO=1`. Ele executa `npm run setup:online -- --environment` com as credenciais da Vercel: aplica somente migrações pendentes e cria dados fictícios apenas em uma base vazia. Compilações comuns e requisições não fazem essa preparação.
4. Consulte `ACESSO-ONLINE.txt` para a senha. O administrador é `admin@demo.sislam.test`. Este arquivo não deve ser versionado ou publicado. Se a base já contém municípios, o comando preserva os dados e as senhas existentes. Após a preparação, remova `SISLAM_DEMO_PASSWORD` da Vercel; as senhas permanecem no banco apenas como hashes.
5. Execute `npm run typecheck`, `npm test` e `npm run build`. Publique a versão testada no projeto conferido. Verifique `/api/auth/me`: sem sessão, o retorno esperado é HTTP 401 com JSON, seguido de login e abertura do painel no navegador.

O limite de anexos nesta hospedagem é 3 MB por arquivo, para caber no limite de requisição da plataforma, incluindo o formulário. A instalação local mantém 10 MB. Os arquivos enviados ao Blob são privados, cifrados e gravados sem sobrescrita. Não há fallback para arquivos ou banco no disco efêmero da Vercel.

A migração `003_runtime_role_membership.sql` permite que a conexão assuma `sislam_runtime` explicitamente, sem herdar seus privilégios. Isso atende ao comportamento de criação de papéis por usuários que não são superusuários no PostgreSQL 16 ou superior. O papel continua sem superusuário e sem bypass de RLS, e todas as políticas permanecem ativas. A preparação pode retomar apenas anexos e eventos ausentes do cenário fictício reconhecido, sem substituir originais, senhas ou registros anteriores.

As cotas e os custos dependem dos planos dos provedores. O banco desta demonstração foi provisionado no plano gratuito; nenhum upgrade pago foi solicitado.

## Verificação no navegador

O roteiro existente aceita `SISLAM_BROWSER_URL` e `SISLAM_BROWSER_ACCESS_FILE` para testar a implantação com credenciais online. Use exclusivamente a base fictícia, pois o roteiro cria um requerimento e percorre documentos, parecer, licença-modelo e condicionante.

## Fontes técnicas

- [Rotas de API do Next.js](https://nextjs.org/docs/pages/building-your-application/routing/api-routes)
- [SDK do Vercel Blob](https://vercel.com/docs/vercel-blob/using-blob-sdk)
- [Limites das funções Vercel](https://vercel.com/docs/functions/limitations)
- [Atributos e concessões de papéis PostgreSQL](https://www.postgresql.org/docs/17/role-attributes.html)
