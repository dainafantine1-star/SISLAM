# Plano de continuidade do SISLAM

Atualização local: [fluxograma municipal com três perfis e 25 etapas](FLUXOGRAMA-MUNICIPAL.md). Taxas, pagamentos e atos autorizativos continuam exclusivamente demonstrativos. O PDF orienta a sequência; não substitui as validações normativas pendentes.

| Etapa do escopo | Situação nesta entrega | Próxima validação |
|---|---|---|
| Descoberta normativa | Dois textos de escopo preservados; fontes normativas não homologadas | Receber Excel, PDFs e gabaritos |
| Protótipo funcional | Fluxo demonstrativo com persistência, perfis, anexos, parecer, modelo de licença e condicionantes | Walkthrough com biólogo e autoridade |
| MVP operacional | Fundamentos de API, banco, autenticação, RLS e auditoria implementados; ativação operacional bloqueada | Regras, ritos, assinaturas e comunicações reais homologados |
| Módulos avançados | Cadastros iniciais de denúncias e vistorias; acompanhamento demonstrativo | Evidências de campo, defesa, recursos, sanções e integrações |
| SaaS | Estrutura municipal, isolamento e suporte temporário | Provisionamento, contratos, cobrança, observabilidade e onboarding repetível |

## Dados que não devem ser presumidos

A demonstração também pode ser hospedada na Vercel com PostgreSQL e armazenamento privado, conforme [DEMONSTRACAO-ONLINE.md](DEMONSTRACAO-ONLINE.md). A hospedagem não altera a situação das etapas acima nem habilita atos oficiais.

- Enquadramento e competência municipal por atividade/localização.
- Faixas ambientais, documentos obrigatórios e hipóteses condicionais.
- Prazos legais, suspensões, transições e provas válidas de ciência.
- Quem assina, homologa e publica cada ato, inclusive substituições.
- Retenção, acesso a denúncias, incidentes e papéis de proteção de dados.

## Itens para o próximo envio

1. `SISLAM ITABERABA.xlsx`, incluindo fórmulas, abas, macros e validações.
2. PDFs oficiais e termos de referência, com vigência e responsáveis pela validação.
3. Modelos de licença, parecer, notificação, fiscalização e condicionantes.
4. De quinze a trinta processos históricos anonimizados, com resultado esperado.
5. Matriz de perfis, alçadas, assinatura e calendário do órgão.

## Critérios já exercitados

Os testes em `tests/workflow.test.ts` usam a API HTTP NestJS, banco PostgreSQL embarcado e arquivos temporários reais. Cobrem autorização e origem, RLS sem filtro explícito, FK entre municípios, fornecedor sem grant, dois de três documentos, separação de recebimento e revisão, versão e hash, regra congelada, notificações sem prazo antes da ciência, fluxo de parecer/decisão/PDF/condicionante, denúncia que não se encerra sozinha e integridade da auditoria. A bateria inclui revisão de enquadramento, indeferimento, suporte temporário, MFA e restauração de backup.

Execução aprovada: 20 testes automatizados, TypeScript, compilação, fluxo no navegador e restauração do backup local. Consulte [VERIFICACAO.md](VERIFICACAO.md) e docs/verificacao/resultado.json para as evidências. Esses checks não substituem homologação técnica, jurídica e de segurança.
