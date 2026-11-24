# Preenchimento manual

A inicialização normal mantém somente Itaberaba e os perfis de acesso, sem empresas, empreendimentos, processos, documentos ou regras de exemplo. Senhas e permissões existentes são preservadas. Os cenários fictícios permanecem apenas nas bases isoladas dos testes.

Para instalações existentes, a migração `005_manual_workspace.sql` e `prepareManualWorkspace` retiram das telas os exemplos identificados pelo par exato de identificador e nome original. Seus processos, anexos e registros relacionados ficam arquivados. Não são excluídos documentos, regras congeladas ou eventos de auditoria. Cadastros manuais são preservados.

1. Entre como requerente e cadastre a organização e o empreendimento. Preencha atividade, endereço, capacidade, unidade, área e, opcionalmente, as duas coordenadas.
2. Crie o requerimento, informe seu objeto e envie ao administrativo. Continue pelo roteiro numerado de 25 etapas.
3. Sem regra aplicável, o técnico preenche porte, potencial, modalidade, referência, justificativa e checklist em **Revisar enquadramento**. Nenhuma faixa ou exigência é presumida.
4. Para cadastrar regras, use a administração municipal em **Regras e legislação**. Informe origem, vigência, unidade, faixas em ordem crescente e documentos por formulário. Uma nova versão não modifica a regra já congelada no protocolo.
5. Documentos, pareceres, comunicações, modelos, vistorias e condicionantes são informados pelos respectivos perfis. A comunicação ao requerente passa pelo administrativo.

Os nomes pessoais inventados das contas iniciais são substituídos pelos nomes dos departamentos. Nomes alterados manualmente não são substituídos. O fornecedor continua exigindo autorização temporária, auditada e somente para leitura.

Os avisos de demonstração e ausência de validade jurídica permanecem. O cadastro manual não homologa competência, legislação, prazos, faixas, assinatura, pagamento ou atos oficiais. Não use esta instalação para emitir atos administrativos reais.

Na instalação local, o iniciador aplica as migrações e a preparação. Em um ambiente configurado, `node scripts/run-typescript.cjs scripts/prepare-manual.ts` aplica migrações pendentes e arquiva somente os exemplos reconhecidos. Execute com as credenciais e o município corretos; preserve `.env`, chaves, anexos e arquivos de acesso. Publicar código no GitHub não aplica alterações ao banco online.

Validação: `npm run typecheck`, `npm test`, `npm run build`, `npm run test:browser:isolated` e `node scripts/browser-suite.cjs --manual`. O último comando usa uma base separada e percorre o cadastro manual, os três perfis, as 25 etapas e os formulários de regras, sem inserir dados de teste na base de uso.
