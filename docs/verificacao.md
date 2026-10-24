# Atualização: centro de informações 0.2

- 22 testes de API aprovados, incluindo preferências, painéis, registros pessoais/financeiros, exportações e isolamento por usuário.
- Build, PostgreSQL 17, Docker, navegação desktop/celular e persistência aprovados no run https://github.com/phzl0/CommanderCenter/actions/runs/40128819907.
- Teste por navegador cobre retirada de Projetos/Atividades do menu, registro de estudo e receita, ocultação/reordenação persistente após atualizar a página e gráfico de análise salva.
- Capturas de desktop e celular revisadas. Fontes externas são fixtures explicitamente identificadas nos testes; disponibilidade ao vivo e uma chave real Alpha Vantage não são validadas pela suíte.
- A migração adiciona quatro tabelas, sem remover os registros existentes. Execução na instalação pessoal ainda precisa da atualização pelo usuário.

Consulte [intelligence-workspace.md](intelligence-workspace.md) para uso e limites.

---

# Verificação do MVP 1

## Resultados confirmados

- Build React/TypeScript com `npm run build`: aprovado localmente e no GitHub Actions.
- 14 testes de API/integração: aprovados localmente em SQLite temporário com chaves estrangeiras habilitadas e no PostgreSQL 17 do GitHub Actions.
- Migração Alembic aplicada em PostgreSQL real; geração de SQL offline também aprovada.
- Fluxo HTTP local com frontend, proxy, API, banco, sessão e logout: aprovado.
- PDF gerado, renderizado com Poppler e revisado visualmente. Teste adicional protege a geração contra células muito extensas.
- Docker Compose: imagens de frontend/backend construídas, banco inicializado, migrações aplicadas e serviços iniciados com sucesso em um runner descartável.
- Teste por navegador: login, sessão após atualizar a página, projeto, tarefa vinculada, conclusão e histórico automático, importação CSV, soma de valores, análise salva, exportação Excel e listagem do relatório: aprovados.
- Navegação móvel: menu e acesso a projetos verificados com viewport de 390 × 844.
- Reinício dos três containers: registro do projeto e arquivo original preservados nos volumes.

Execuções que comprovam a validação:

- https://github.com/phzl0/CommanderCenter/actions/runs/40125218446 — suíte inicial PostgreSQL e build.
- https://github.com/phzl0/CommanderCenter/actions/runs/40125780610 — API/PostgreSQL, build, Docker, navegador e persistência.
- https://github.com/phzl0/CommanderCenter/actions/runs/40125841710 — repetição após ajuste do seletor do teste, com o mesmo fluxo completo.

As capturas de desktop e celular ficam nos artefatos `e2e-results` dos runs, com retenção de sete dias. A suíte usa uma conta e dados descartáveis; eles não são criados no ambiente pessoal ao iniciar o aplicativo.

## Cobertura da suíte de API

Autenticação, sessão revogada no logout, conta desativada, limite de tentativas, bloqueio de origens não autorizadas, rejeição de campos de proprietário enviados pelo cliente, isolamento entre usuários em consultas/edições/downloads, paginação/busca, conclusão de tarefas sem evento duplicado, reabertura, relações de atividade, CSV com codificação/decimal, múltiplas abas Excel, filtros/agregações/agrupamentos, análise salva/reexecutada, arquivos inválidos/limites, exportações CSV/XLSX/PDF, proteção de fórmulas nas exportações e exclusão de arquivos relacionados.

## Ajustes identificados durante a verificação

- Campos de seleção receberam nomes acessíveis explícitos; o teste passou a selecionar o relacionamento pelo papel `combobox`.
- Células longas são abreviadas no PDF para não ultrapassarem a altura de uma página. CSV/Excel mantêm os dados dentro dos limites de seus formatos.
- A inicialização aguarda o PostgreSQL antes de aplicar migrações, inclusive após reiniciar os containers.

## Pendente no computador do usuário

O ambiente de implementação não tem Docker; a validação Docker ocorreu em runner de testes. Ainda é necessário executar no Ubuntu do usuário e verificar sua versão do Docker, permissões locais, portas e desempenho com seus arquivos reais. O fluxo completo de backup/restauração está documentado, mas ainda não foi validado de ponta a ponta.

A aprovação dos testes não substitui a revisão das telas e regras com o usuário. Não existe configuração de deploy nesta etapa.

## Roteiro de aceite local

1. Inicializar `.env`, subir Compose e criar uma conta.
2. Entrar, atualizar a página e confirmar que a sessão continua.
3. Criar um projeto, uma tarefa vinculada e uma atividade manual.
4. Concluir a tarefa duas vezes via edição: deve existir somente um evento automático dessa conclusão.
5. Conferir os contadores do dashboard.
6. Importar CSV e Excel próprios, testar abas e comparar soma/média com a planilha.
7. Salvar análise, reabrir, gerar CSV, Excel e PDF e abrir os três arquivos.
8. Criar segunda conta pelo CLI e confirmar que ela inicia sem os dados da primeira.
9. Parar e subir os serviços, verificar registros e download do original.
10. Testar backup/restauração em instalação vazia antes de depender dele.

PDF é um resumo com até 200 linhas, 8 colunas e texto de células limitado a 160 caracteres. As listagens de arquivos/análises/relatórios e os seletores de relacionamento exibem até 1.000 registros; as listas principais de gestão têm paginação.
