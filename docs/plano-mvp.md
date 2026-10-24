# Command Center — MVP 1

## Objetivo
Dashboard pessoal de inteligência e gestão profissional, preparado para expansão a múltiplos usuários.

## Escopo aprovado
- Autenticação privada, sem cadastro público inicialmente; isolamento dos dados por usuário.
- Projetos, tarefas e atividades, com registro automático da conclusão de tarefas.
- Dashboard com projetos ativos, tarefas pendentes, atrasadas e concluídas e atividades recentes.
- Importação de Excel/CSV com prévia, identificação de colunas e erros de leitura.
- Análises com seleção de colunas, filtros, soma, média e contagem conforme os tipos dos dados.
- Relatórios de gestão e análises; exportação em CSV, Excel e PDF.
- Arquivo original mantido em armazenamento privado até sua exclusão pelo usuário.

## Arquitetura
Monólito modular: Python, FastAPI, PostgreSQL, SQLAlchemy, Alembic, Pandas/openpyxl, React, TypeScript e Docker. O sistema deve funcionar sem IA.

Entidades iniciais: Usuário, Projeto, Tarefa, Atividade, Importação, Análise e Relatório. Tarefas podem existir sem projeto; atividades podem ser manuais ou automáticas e ter vínculos opcionais. Análises guardam a configuração dos filtros e cálculos. Planilhas não alteram automaticamente os registros de gestão.

## Organização proposta
- backend/app/core/: configuração, segurança e banco.
- backend/app/modules/: módulos de negócio.
- backend/alembic/: migrações.
- backend/tests/: validação das regras e permissões.
- frontend/src/: interface e comunicação com a API.
- docs/: requisitos e decisões.
- infra/: configuração local dos serviços.

## Etapas e commits
1. Base local: backend, frontend, PostgreSQL, Alembic e Docker.
2. Autenticação privada e isolamento por usuário.
3. Projetos, tarefas e atividades.
4. Dashboard com indicadores reais.
5. Importação e análise de planilhas.
6. Geração e exportação de relatórios.
7. Validação integrada e persistência.
8. Configuração de deploy somente ao final.

Cada etapa terá commits descritivos e registro das verificações realizadas. Desenvolvimento e testes locais primeiro. Segredos, arquivos enviados e conteúdo do banco ficam fora do Git. Commits não substituem backups do banco.

## Critérios da primeira entrega
Interface acessível, API respondendo, conexão com PostgreSQL, migrações executáveis e dados persistentes após reinício dos serviços.

## Fora do MVP 1
Notícias de negócios, política e economia; integrações GitHub e Google Calendar; agente LangGraph e automações.
