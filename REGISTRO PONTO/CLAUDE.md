# REGISTRO PONTO

## ⚠️ Migração futura: Electron + SQLite + .exe

Esse sistema será convertido para **Electron** com banco **SQLite** (arquivo `.db` local). O localStorage atual é provisório.

**O que isso implica nas decisões de código:**
- Não over-engineer soluções que dependam de `localStorage` — a migração vai reescrever as camadas de dados
- Foque em lógica de UI/UX que será reaproveitável (CSS, HTML, estrutura de componentes)
- Paginação, buscas complexas, cache elaborado em JS puro serão substituídos por queries SQL — não vale a pena implementar agora
- O que for feito hoje deve ser fácil de adaptar: a camada de dados (`getStore`, `LS`, `registrarLog`) será substituída, a interface (HTML+CSS) tende a ser reaproveitada

## Memória de Sessão

- Ao iniciar uma nova sessão, leia o arquivo de conversa mais recente em `conversas/` (ordenar por nome decrescente, pegar o primeiro) para entender o contexto do que foi feito e o que está pendente.
- Se houver instruções explícitas de próximo passo no final da conversa, prossiga a partir dali. Caso contrário, pergunte ao usuário como deseja continuar.
