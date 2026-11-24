# Demonstração do fluxo municipal

O roteiro `municipal-ba-1` foi transcrito do PDF fornecido, página impressa 81. O original foi copiado para [entradas/03-fluxograma-municipal.pdf](entradas/03-fluxograma-municipal.pdf), sem alteração. A definição versionada está em `src/lib/municipal-workflow.v1.json`; cada novo processo conserva sua cópia. O documento é uma referência de fluxo, não uma homologação normativa.

## Três acessos

| Perfil | Conta demonstrativa | Função |
|---|---|---|
| Requerente | `requerente@demo.sislam.test` | Cadastrar clientes e empreendimentos, solicitar abertura, enviar documentos e acompanhar respostas |
| Departamento administrativo | `protocolo@demo.sislam.test` | Receber, verificar duplicidade, gerar número, encaminhar e comunicar ao requerente |
| Departamento técnico | `tecnico@demo.sislam.test` | Conferir enquadramento, definir checklist, analisar documentos e estudos, registrar vistorias e pareceres |

As contas já existentes são reutilizadas; consulte a senha atual no arquivo local `ACESSO-LOCAL.txt`. Na tela de login, os três acessos principais aparecem em destaque. Outros perfis de apoio continuam disponíveis no seletor.

O requerente pode manter várias organizações/clientes na mesma conta e filtrar seus processos por cliente. Isso não concede acesso a empresas de outro requerente. O nome de Itaberaba na lateral abre o seletor, que apresenta somente Itaberaba nesta demonstração. A sessão continua validando município e vínculo na API; o município de homologação permanece acessível apenas pela conta administrativa de teste, em Minha conta.

## Sequência

1. Requerente solicita abertura.
2. Administrativo confere pedidos anteriores e gera o número, congelando a regra de exemplo disponível.
3. Técnico recebe o pedido administrativo.
4. Técnico verifica enquadramento e registra referência e justificativa de competência. O ramo 4a passa ao administrativo para comunicar encaminhamento externo e terminar o roteiro municipal.
5. Técnico confirma o enquadramento municipal e a continuidade do protocolo.
6. Técnico define processo, documentos e estudo ambiental. A revisão do enquadramento registra justificativa e proposta anterior.
7. Administrativo comunica o checklist.
8. Requerente envia a documentação.
9. Administrativo registra o recebimento e encaminha ao técnico.
10. Técnico verifica os documentos. O ramo inadequado segue 10a (pendências técnicas), 10b (comunicação administrativa), 10c (resposta do requerente) e retorna a 9.
11. Técnico registra a documentação adequada.
12. Administrativo informa referência e valor de uma taxa simulada, sem gerar boleto bancário.
13. Requerente anexa comprovante fictício de pagamento.
14. Administrativo recebe, verifica e comunica o pagamento simulado.
15. Na etapa identificada como 15a, o técnico analisa o estudo e registra o plano de vistoria. Estudo inadequado passa por comunicação administrativa, 15b (revisão pelo requerente) e recebimento administrativo antes de voltar a 15a.
16. Técnico dá continuidade com estudo adequado.
17. Técnico registra relatório de vistoria demonstrativa.
18. Técnico produz e revisa parecer final: favorável, favorável com ressalvas e condicionantes ou desfavorável. Correções exigem justificativa e preservam a versão anterior.
19. Diante de parecer desfavorável, administrativo registra reabertura para análise ou arquivamento demonstrativo fundamentado.
20. Técnico registra o parecer favorável e encaminha o ato-modelo ao administrativo.
21. Administrativo registra exclusivamente uma licença-modelo, com parecer favorável revisado de outro agente. Isso não atribui competência para assinatura ou concessão de atos reais. O perfil de autoridade permanece separado para os controles anteriores da demonstração.
22. Técnico acompanha as condicionantes e encaminha ao administrativo a solicitação de relatório.
23. Requerente envia relatório periódico; administrativo recebe e encaminha.
24. Técnico registra vistoria de acompanhamento.
25. Requerente conclui o roteiro e pode criar uma renovação vinculada, iniciada na etapa 1, preservando o processo anterior.

O PDF repete o rótulo 15a para a análise e o desvio de estudo inadequado. O sistema mantém 15a para a análise e registra a escolha de adequação como ação dessa etapa. As passagens administrativas associadas a 15, 22 e 23 são explícitas para atender à orientação da reunião de que o técnico não conversa diretamente com o requerente. As referências auxiliares 6a/6b/6c são conteúdos a conferir na definição documental; não foram transformadas em exigências legais automáticas.

## Segurança e preservação

As etapas validam responsável, revisão e ação permitida na API. Movimentações genéricas não podem saltar etapas de processos que adotaram o roteiro. Documentos precisam de recebimento administrativo antes da revisão técnica; documentos obrigatórios pendentes impedem a adequação e o parecer favorável. A abertura administrativa verifica outro requerimento ativo do mesmo empreendimento. Minutas de notificação ficam internas até a expedição administrativa, inclusive por política RLS.

Processos antigos não são reescritos nem recebem etapas cumpridas artificialmente. Neles, **Adotar roteiro numerado** exige justificativa e inicia o acompanhamento na etapa 1, preservando protocolo, regra congelada, anexos e pareceres. Novos requerimentos já nascem no roteiro. A preparação local acrescenta o exemplo **Demonstração do fluxograma municipal — 25 etapas**, sem substituir os exemplos anteriores.

Taxas, pagamentos, vistorias, pareceres e licenças deste roteiro são registros demonstrativos. Não há boleto bancário, assinatura oficial, publicação oficial, comunicação externa real ou comprovação jurídica de pagamento/ciência. Valores, competência, documentos, modalidade e prazos reais continuam sujeitos aos dados versionados e à homologação do órgão.

## Verificação desta entrega

Em 24/11/2026, passaram `npm run typecheck`, `npm test` (35 testes), `npm run build` e a suíte de Edge em base isolada (25 verificações, 17 rotas e 284 interações). O percurso incluiu os três painéis, a logo, o seletor de Itaberaba, as 25 etapas, a devolução de estudo e o envio de comprovantes. Não houve erros de página ou de servidor; o backup da suíte foi restaurado e conferido.

A inicialização de produção local também foi exercitada na base preservada: tela de login com resposta HTTP 200, autenticação dos três perfis com as senhas existentes e exemplo numerado disponível na etapa 1. O executor local compila TypeScript em memória para evitar a falha de consulta de usuário do Windows no inicializador do `tsx`; não cria outra base nem redefine credenciais. As evidências sem credenciais estão em [verificacao/fluxograma-municipal.json](verificacao/fluxograma-municipal.json).
