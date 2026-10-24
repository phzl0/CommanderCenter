# Command Center

Dashboard privado para gestão de projetos, tarefas, atividades e análise de planilhas. MVP 1 com funcionamento independente de IA. O nome do repositório é `CommanderCenter`; a aplicação usa a marca **Command Center**.

## Funcionalidades

- Acesso privado por sessão; contas criadas no terminal, sem cadastro público.
- Projetos com descrição, prazo e situação, incluindo arquivamento.
- Tarefas com prioridade, prazo, vínculo opcional com projeto e conclusão/reabertura.
- Histórico automático de conclusão e registro manual de atividades.
- Dashboard com projetos ativos, tarefas abertas, atrasadas, concluídas e atividades recentes.
- Importação de CSV, XLSX e XLS com prévia e opções de leitura.
- Seleção de colunas, filtros, soma, média, contagem e agrupamento; análises salvas e reutilizáveis.
- Relatórios de gestão e de análises, exportados em CSV, Excel e PDF.
- Download de originais e exclusão de arquivos e relatórios.

## Executar no Ubuntu com Docker

Requisitos: Git, Python 3 para a configuração inicial, Docker Engine e plugin Docker Compose. Não é necessário instalar Node, PostgreSQL ou bibliotecas Python no sistema para executar a aplicação.

1. `git clone` baixa o código. `cd` entra na pasta do projeto:

```bash
git clone https://github.com/phzl0/CommanderCenter.git
cd CommanderCenter
```

2. O script abaixo cria um `.env` local com uma senha aleatória para o banco. Não altera um `.env` existente e não exibe a senha:

```bash
python3 infra/init_env.py
```

3. `docker compose up --build -d` constrói as imagens e inicia os serviços em segundo plano. O backend aplica as migrações antes de iniciar:

```bash
docker compose up --build -d
```

4. `docker compose ps` mostra os serviços. `logs` permite acompanhar a inicialização. Aguarde a mensagem de inicialização da API antes de criar a conta:

```bash
docker compose ps
docker compose logs -f backend
```

Use `Ctrl+C` para sair da visualização dos logs; os serviços continuam ativos.

5. Crie sua conta. `exec` executa o comando dentro do backend. Substitua o e-mail e o nome; a senha será solicitada sem aparecer na tela (12 a 128 caracteres):

```bash
docker compose exec backend python -m app.cli create-user --email "seu-email@exemplo.com" --name "Paulo"
```

6. Abra **http://localhost:5173** e entre com a conta criada. API: **http://localhost:8000/docs**; verificação: **http://localhost:8000/api/health**.

O banco fica na rede interna do Docker. Os serviços acessíveis pelo navegador ficam vinculados a `127.0.0.1`, para uso neste computador.

## Atualizar e parar

`git pull` baixa os novos commits. O segundo comando reconstrói os serviços; as migrações são executadas automaticamente:

```bash
git pull --ff-only
docker compose up --build -d
```

Para parar, preservando os volumes:

```bash
docker compose down
```

Não acrescente `-v`: essa opção remove os volumes e apaga banco e arquivos locais. Guarde o `.env`; mudar a senha nele não altera a senha de um banco já inicializado.

## Contas

Redefinir senha invalida as sessões existentes:

```bash
docker compose exec backend python -m app.cli reset-password --email "seu-email@exemplo.com"
```

Desativar conta também invalida sessões:

```bash
docker compose exec backend python -m app.cli disable-user --email "seu-email@exemplo.com"
```

É possível criar outras contas pelo mesmo comando de criação. Cada usuário vê somente seus próprios registros, arquivos, análises e relatórios.

## Dados e relatórios

- CSV: UTF-8 ou Latin-1; separador automático, vírgula, ponto e vírgula, tabulação ou barra vertical; decimal com ponto ou vírgula. Valores de filtros numéricos usam ponto decimal.
- Excel: primeira aba inicialmente; seleção das demais na tela. A primeira linha deve conter cabeçalhos. Fórmulas não são executadas; os valores previamente calculados dependem de o Excel ter salvo o arquivo com esses resultados.
- Limites iniciais: 10 MB por arquivo, 50.000 linhas e 100 colunas por aba; XLSX descompactado até 100 MB. Listagens de arquivos, análises e relatórios mostram os 1.000 mais recentes.
- Prévia: até 50 linhas e 100 grupos. Cálculos e exportações CSV/Excel usam todos os dados filtrados dentro dos limites.
- Contagem considera células não vazias da coluna; média ignora células vazias. Soma/média exigem tipo numérico.
- CSV exporta os dados filtrados com `;` e UTF-8 BOM. Excel inclui abas de dados, resumo e agrupamentos. PDF contém os cálculos e uma prévia de até 200 linhas e 8 colunas, com os limites indicados.
- Relatórios de gestão filtram por criação do registro ou realização da atividade, em UTC. Prazo das tarefas e indicadores de atraso usam a data em America/Sao_Paulo.
- O relatório é uma fotografia no momento da geração; gerar outro recalcula os dados atuais.
- Excluir uma importação remove seu original, análises e relatórios relacionados. Relatórios de gestão são independentes.
- Reabrir e concluir uma tarefa gera um novo evento histórico. Apenas editar uma tarefa já concluída não duplica o evento. Atividades automáticas são preservadas; as manuais podem ser editadas.

## Estrutura e testes

Backend: FastAPI, SQLAlchemy, Alembic, PostgreSQL, Pandas e ReportLab. Frontend: React, TypeScript e Vite. Monólito modular; nenhuma chave de IA ou integração externa é necessária.

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python -m pytest -q
```

Por padrão, os testes usam bancos SQLite temporários com chaves estrangeiras habilitadas. Para testar PostgreSQL, defina `TEST_DATABASE_URL` apontando para um banco descartável cujo nome termine em `_test`. A suíte aplica/desfaz migrações nesse banco; nunca use o banco pessoal.

```bash
cd frontend
npm ci
npm run build
```

O workflow de testes do GitHub verifica o backend com PostgreSQL 17 e o build do frontend. Não publica a aplicação.

Veja [docs/verificacao.md](docs/verificacao.md), [docs/arquitetura.md](docs/arquitetura.md) e [docs/plano-mvp.md](docs/plano-mvp.md).

## Persistência e backup

O volume `postgres_data` contém o banco e `private_storage` contém os arquivos. Código e migrações ficam no Git; dados e `.env` não. Commit não é backup dos seus dados. Consulte [docs/backup.md](docs/backup.md) para salvar e restaurar ambos.

Deploy, integrações, notícias, LangGraph e automações ficam para etapas futuras. Esta configuração é destinada ao uso local; não foi preparada para exposição pública.
