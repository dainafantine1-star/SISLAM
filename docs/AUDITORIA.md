# Integridade da auditoria local

Os eventos são imutáveis, encadeados por município e conferidos contra o cabeçalho da cadeia. Essa verificação não substitui ancoragem externa ou auditoria independente: o administrador da infraestrutura controla a base e as chaves locais.

A migração 002 acrescenta uma versão de serialização sem reescrever eventos ou hashes. Novos eventos usam a versão 2: o payload é normalizado por serialização JSON antes do cálculo, e a versão faz parte do digest. Isso evita diferenças entre campos opcionais em memória e sua representação persistida em JSONB.

A primeira demonstração usava a versão 1. Um protocolo sem exigência condicional incluía `classification.reason: undefined` no cálculo; o JSONB omitia essa chave. O verificador tenta exclusivamente essa representação conhecida para eventos `case.filed` da versão 1 e exige correspondência integral com o hash original. Qualquer divergência continua sendo erro de integridade. A API e a interface informam quantos eventos exigiram essa compatibilidade. Nenhum registro histórico é modificado.

Os testes cobrem novo protocolo, campos opcionais aninhados, datas, arrays, rejeição de adulteração e compatibilidade legada sem mutação.
