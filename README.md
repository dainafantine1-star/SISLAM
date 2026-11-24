# SISLAM

Sistema Inteligente de Licenciamento e Gestão Ambiental. Primeira entrega local demonstrativa para o piloto de Itaberaba / BA, baseada nos dois escopos fornecidos em novembro de 2026.

## Abrir no Windows

1. Dê dois cliques em **INICIAR SISLAM.cmd**.
2. Aguarde a preparação e a abertura de `http://localhost:3400`.
3. Consulte **ACESSO-LOCAL.txt** para a senha dos perfis fictícios. A conta de administração é `admin@demo.sislam.test`.
4. Deixe a janela de execução aberta. Ao terminar, pressione `Ctrl+C` nessa janela para encerrar os serviços.

Requer Node.js 24. As dependências estão incluídas na instalação local preparada. Em uma cópia sem `node_modules`, o iniciador instala os pacotes a partir do `package-lock.json`.

Os dados persistem em `runtime/database`. Os anexos ficam cifrados em `runtime/files`. A primeira execução gera `.env` e senhas aleatórias; execuções posteriores preservam a base. **Não apague `.env`: a chave é necessária para ler anexos, MFA e backups.**

## Demonstração online

Há uma adaptação para executar a demonstração na Vercel com PostgreSQL externo e anexos privados persistentes. Consulte [DEMONSTRACAO-ONLINE.md](docs/DEMONSTRACAO-ONLINE.md) para configuração e limites. A publicação continua sem validade jurídica e usa dados fictícios; o modo operacional permanece bloqueado.

## O que esta versão faz

O roteiro municipal fornecido em novembro de 2026 agora tem [sequência numerada, três acessos e instruções de demonstração](docs/FLUXOGRAMA-MUNICIPAL.md). Novos requerimentos seguem as etapas do PDF com responsáveis e retornos administrativos. A logo SISLAM Brasil foi aplicada e o nome de Itaberaba abre a seleção de município.

- Login por senha com hash scrypt, sessões opacas em cookie HTTP-only, expiração, troca de senha e MFA TOTP configurável. O modo operacional exige MFA para servidores; sua ativação pública permanece bloqueada nesta entrega.
- Perfis separados de requerente, protocolo, técnico, autoridade, fiscalização, ouvidoria, administrador municipal e fornecedor. O fornecedor depende de autorização municipal temporária, de leitura e auditada.
- Organizações e empreendimentos com atividade, capacidade, área e coordenadas. Capacidade ambiental e cadastro fiscal não são tratados como a mesma medida.
- Requerimentos, protocolo, enquadramento demonstrativo, checklist, fila, distribuição, movimentações e renovação vinculada ao histórico anterior.
- Motor determinístico com versões imutáveis, vigência e congelamento da regra no protocolo. Ausência de regra, capacidade fora da faixa ou exigência condicional não resolvida exigem revisão humana.
- Upload de PDF, PNG e JPEG de até 10 MB com conferência de formato, SHA-256, cifragem, recibo e nova versão em reenvios. Recebimento administrativo precede análise técnica. O original e a regra do protocolo são protegidos por triggers.
- Revisão técnica justificada do enquadramento sem apagar a proposta anterior; pareceres versionados e revistos; decisão por autoridade diferente do autor do parecer. Pendências bloqueiam parecer favorável e licença-modelo.
- Licença **de demonstração**, PDF com QR/código de verificação, publicação demonstrativa e indeferimento fundamentado sem emissão de licença.
- Condicionantes, prazos informados pela autoridade, comprovação e análise. Vencimento não produz multa automaticamente.
- Minutas de notificação, aprovação, expedição e ciência **simuladas**. O contador só inicia depois de evidência e instante de ciência. Dias úteis usam o calendário cadastrado.
- Denúncias com acesso restrito e contato cifrado separado; triagem, diligência, apuração, conclusão e arquivamento. Um requerimento não encerra automaticamente uma denúncia.
- Agendamento de vistorias, relatórios, arquivo processual e auditoria encadeada verificável.
- Backup integral cifrado, conferência por restauração em base isolada e comando de recuperação para uma pasta nova.

## Roteiro de demonstração

1. Entre com `requerente@demo.sislam.test`. Abra o processo **Madeireira Serra Verde (fictícia)**. Há dois anexos de três itens no checklist.
2. Entre como `protocolo@demo.sislam.test` e registre o recebimento dos dois documentos.
3. Entre como `tecnico@demo.sislam.test`, analise as peças e prepare a minuta de exigência para o item faltante. O prazo exige parâmetro e fundamento informados; o sistema não inventa prazo legal.
4. Envie a planta de localização com o perfil requerente. Receba com o perfil protocolo e analise com o perfil técnico.
5. Mova o processo para análise, registre parecer favorável revisado e encaminhe à decisão.
6. Entre como `autoridade@demo.sislam.test`, abra **Licença e condicionantes**, aprove o modelo, publique a demonstração e baixe o PDF. A consulta por código continua identificada como sem validade jurídica.
7. Cadastre uma condicionante, envie uma comprovação pelo perfil requerente e analise pelo técnico/fiscal.
8. Consulte **Auditoria → Verificar integridade**. Para comparar municípios, a conta administrativa também tem acesso ao município fictício de homologação em **Minha conta**.

## Comandos

```powershell
npm.cmd run dev
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd run start
```

A API NestJS atende somente no loopback, porta 3401. A interface Next.js usa a porta 3400 e encaminha `/api` à API. A especificação de rotas está em `http://localhost:3401/api/docs` enquanto os serviços estão abertos. A API aplica autenticação, perfil, município, recurso e proteção de origem; permissões da interface não substituem o backend.

### Backup e restauração

**Feche o SISLAM antes de executar backup com a base embarcada.** Uma trava impede duas instâncias sobre o mesmo diretório. O backup inclui todos os municípios, usuários, hashes de senha, sessões e arquivos; o arquivo final é cifrado. Proteja-o junto com a chave, em locais apropriados e separados.

```powershell
npm.cmd run backup
npm.cmd run verify:backup
npm.cmd run restore -- "C:\caminho\arquivo.sislam" "C:\caminho\restauracao-nova"
```

`restore` exige um destino que não exista e nunca substitui a base em uso. Preserve `APP_ENCRYPTION_KEY` e ajuste `DATA_DIR` para o diretório recuperado antes de iniciar. A verificação restaura todos os registros em outro PGlite e compara checksums. O backup local não é uma política de retenção externa ou recuperação de desastre por si só.

## Arquitetura

Monólito modular: Next.js 16 + React + TypeScript na interface e NestJS na API. SQL parametrizado, PostgreSQL com RLS e chaves compostas para isolamento municipal. PGlite permite a demonstração sem Docker; a camada de dados também aceita `DATABASE_URL` para PostgreSQL externo. Anexos cifrados localmente ou em armazenamento compatível com S3 quando configurado.

Domínios em `api/`: identidade, cadastro/regras, processos, documentos, monitoramento e administração. A auditoria usa sequência por município, hashes canônicos e bloqueio de alterações. Uma revisão independente e ancoragem externa são necessárias para alegações mais fortes de inviolabilidade.

## Limites e próximos insumos

Esta entrega é uma **demonstração funcional local**, não um sistema homologado para atos administrativos reais. A inicialização operacional está bloqueada explicitamente. Não há assinatura oficial, publicação em diário oficial, envio de e-mail/SMS ou ciência jurídica real. O outbox registra a simulação de forma idempotente; Redis e trabalhadores de entrega operacional são uma etapa posterior.

O antivírus **não foi executado** quando a tela mostra `demo_unscanned`. Um adaptador externo pode ser configurado por `ANTIVIRUS_URL`; sem retorno explícito `{"status":"clean"}`, o arquivo fica em quarentena fora da demonstração. A conexão S3 precisa de credenciais e bucket reais. Esses provedores não foram contratados ou ativados automaticamente.

A IA está desligada. Minutas são templates determinísticos com dados e referência da regra, sem fingir uso de um modelo de IA. OCR, RAG, importação da planilha Excel, homologação normativa, integrações oficiais, autos/sanções/defesas/recursos completos, contratação SaaS e faturamento ainda dependem das próximas etapas.

São necessários a planilha original, PDFs normativos, termos de referência, modelos oficiais, calendário, matriz de competência/assinatura e casos históricos anonimizados com gabarito técnico. As referências fornecidas estão listadas para conferência; nenhum conteúdo legal foi interpretado automaticamente como regra vigente.

Não use dados pessoais reais na demonstração. Não exponha as portas na internet. Não publique `.env`, `ACESSO-LOCAL.txt` ou `runtime`. Antes de uso real: validação jurídica/técnica, revisão de segurança independente, isolamento e recuperação em infraestrutura de homologação, fornecedores configurados e aceite do órgão.
