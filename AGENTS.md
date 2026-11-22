# SISLAM: orientações do projeto

- Leia README.md e docs/PLANO-DE-ENTREGA.md antes de alterar escopo ou ativar integrações.
- A entrega atual é local e demonstrativa. Preserve os avisos de ausência de validade jurídica; não habilite atos oficiais sem as validações e provedores pendentes.
- Não invente exigências ambientais, competência, prazos, faixas ou citações legais. Regras pertencem a dados versionados, nunca a condições legais fixas no código.
- Não sobrescreva documentos originais ou a regra congelada no protocolo. Revisões registram justificativa e proposta anterior.
- Mantenha o isolamento por município e por requerente no banco e na API. Não contorne RLS para resolver erros de acesso.
- O suporte do fornecedor é excepcional, temporário, auditado e de leitura. Não use esse perfil para alterar decisões.
- Preserve .env, ACESSO-LOCAL.txt e runtime; não os inclua no controle de versão ou publique seus valores.
- Testes: npm run typecheck, npm test e npm run build. Com a demonstração aberta, npm run test:browser percorre o cenário fictício em navegador Edge.
- API NestJS em api; interface em src; SQL em db. Novas alterações de esquema exigem uma nova migração; não edite uma migração já aplicada a dados do usuário.
