# Command Center — Beta

> **Projeto em fase beta (0.8.1).** Recursos, interface e integrações ainda estão em evolução.

## Comece aqui: executar no seu computador

O **Command Center funciona localmente**, com Docker. Não precisa de Render, Vercel, chave de IA ou servidor contratado. Os dados ficam nos volumes do Docker deste computador. A primeira instalação e a consulta de fontes externas precisam de internet.

Escolha seu sistema e execute os comandos na ordem. Se o repositório estiver privado, sua conta GitHub precisa ter permissão de acesso; use sua autenticação Git ou a URL SSH se já estiver configurada.

### Linux

**1. Instale os requisitos:** Git, Python 3, Docker Engine e o plugin Docker Compose. Para instalar Docker, siga o [guia da sua distribuição](https://docs.docker.com/engine/install/) — [Ubuntu](https://docs.docker.com/engine/install/ubuntu/).

Confira no terminal:

```bash
git --version
python3 --version
docker --version
docker compose version
```

**2. Baixe o projeto e crie a configuração local.** O script gera a senha do PostgreSQL e não sobrescreve um `.env` existente.

```bash
git clone https://github.com/phzl0/CommanderCenter.git
cd CommanderCenter
python3 infra/init_env.py
```

**3. Construa e inicie os serviços.** A primeira execução pode demorar alguns minutos. As migrações do banco são automáticas.

```bash
sudo docker compose up --build -d
sudo docker compose ps
sudo docker compose logs -f backend
```

Aguarde a API iniciar. Use `Ctrl+C` para sair dos logs; os serviços continuam funcionando. Se seu usuário já tem acesso ao Docker, pode omitir `sudo`.

**4. Crie sua conta.** Substitua o e-mail e o nome. Digite e confirme uma senha de 12 a 128 caracteres; ela não aparece no terminal.

```bash
sudo docker compose exec backend python -m app.cli create-user --email "seu-email@exemplo.com" --name "Seu Nome"
```

**5. Abra [http://localhost:5173](http://localhost:5173)** e entre com a conta criada. Mantenha o Docker em execução durante o uso.

### Windows — PowerShell

**1. Instale os requisitos:** [Git](https://git-scm.com/downloads), [Python 3](https://www.python.org/downloads/windows/) e [Docker Desktop](https://docs.docker.com/desktop/setup/install/windows-install/). Use o backend WSL 2 e containers Linux no Docker Desktop. Siga os requisitos e reinicializações indicados pelo instalador.

Abra o Docker Desktop, aguarde o mecanismo iniciar e abra um novo **PowerShell**. Confira:

```powershell
git --version
py -3 --version
docker --version
docker compose version
```

Se `py` não existir, mas `python --version` funcionar e indicar Python 3, use `python` no lugar de `py -3` abaixo.

**2. Baixe o projeto e crie a configuração local:**

```powershell
git clone https://github.com/phzl0/CommanderCenter.git
cd CommanderCenter
py -3 infra/init_env.py
```

**3. Construa e inicie os serviços:**

```powershell
docker compose up --build -d
docker compose ps
docker compose logs -f backend
```

Aguarde a API iniciar. Use `Ctrl+C` para sair dos logs sem parar a aplicação.

**4. Crie sua conta** com e-mail, nome e senha próprios:

```powershell
docker compose exec backend python -m app.cli create-user --email "seu-email@exemplo.com" --name "Seu Nome"
```

**5. Abra [http://localhost:5173](http://localhost:5173)** e entre. O Docker Desktop precisa permanecer em execução. Esses comandos são para PowerShell; não misture com comandos `sudo` do Linux.

### Atualizar, parar e resolver problemas

Na pasta `CommanderCenter`, baixe os commits e reconstrua os serviços:

```bash
git pull --ff-only
docker compose up --build -d
```

No Linux, acrescente `sudo` ao comando Docker se necessário. `git pull --ff-only` atualiza os arquivos sem criar um merge; se houver divergência de histórico, ele interrompe a atualização. O comando Docker aplica a versão atualizada. Se a página parecer antiga, recarregue com `Ctrl+Shift+R`.

Para parar preservando seus dados:

```bash
docker compose down
```

| Problema | O que fazer |
| --- | --- |
| `permission denied` em `/var/run/docker.sock` no Linux | Execute o comando Docker com `sudo`. Não altere as permissões do socket para acesso público. |
| Docker não conecta no Windows | Abra o Docker Desktop e confira se o mecanismo de containers Linux está ativo. |
| A página ainda não abre | Confira `docker compose ps` e `docker compose logs --tail=80 backend frontend`. Aguarde o término da inicialização. |
| Login não funciona na primeira instalação | Crie a conta pelo comando acima. Não há usuário/senha padrão. |
| Uma fonte externa falha | Veja o aviso e a data da consulta na tela. Sites podem bloquear leitura; notícias permitem trocar para uma alternativa. |

**Não use `docker compose down -v` para atualizar:** `-v` remove os volumes, incluindo banco e arquivos. Preserve o `.env`; trocar sua senha não muda a senha de um PostgreSQL já inicializado. Antes de reinstalar ou migrar, consulte [backup e restauração](docs/backup.md).

## Sobre o projeto

O **Command Center** é um centro pessoal de informações e controle diário: reúne o que acontece no mercado com compromissos, tarefas pessoais, dados e documentos em um só lugar.

O objetivo é facilitar a consulta de notícias, empresas, indicadores econômicos e da própria rotina. Funciona independentemente de IA e permite contas separadas, com registros privados por usuário. O repositório se chama `CommanderCenter`; a marca da aplicação é **Command Center**.

### O que está disponível na beta

- **Visão geral:** até cinco cards configuráveis, incluindo tipos repetidos; o quinto ocupa a largura inteira.
- **Economia:** mapa de ações com altas/baixas e gráficos de Selic, dólar, PIB e IPCA.
- **Notícias:** Política, Futebol e Economia, três fontes padrão por categoria, escolha de principal/alternativas e cadastro guiado de fonte própria.
- **Agenda:** calendário, compromissos, afazeres, avisos, resumo do dia, próximos sete dias e alertas de conflito.
- **Dados e arquivos:** importação de PDF, CSV, XLS e XLSX, filtros, cálculos, análises salvas e relatórios PDF/CSV/Excel.
- **Perfil e segurança:** preferências, troca de senha e controle de sessões.
- **Conexões opcionais:** GitHub, Microsoft e Google Calendar, além de clima e registros pessoais/financeiros.

Projetos, atividades e metas anteriores permanecem preservados no banco; algumas dessas áreas saíram da navegação para simplificar a experiência atual.

### Integrações e limites

O núcleo local funciona sem conectar contas externas. Fontes de notícias, clima, cotações e contas conectadas dependem de internet e da disponibilidade dos respectivos provedores.

- O mapa de ações permite configurar sua chave brapi em **Economia → Configurar cotações**. Sem chave, a cobertura inicial é limitada.
- Dólar/Selic mantêm a frequência diária disponível; IPCA é mensal e PIB é trimestral. Selecionar 24h não cria uma série por hora.
- Notícias usa uma fonte por vez em cada categoria. Sites com bloqueio, login ou conteúdo dependente de JavaScript podem não permitir leitura.
- Para conectar contas, consulte [conexões pelo sistema](docs/conexoes-pelo-sistema.md). Credenciais de aplicativos OAuth precisam de configuração administrativa inicial; depois, cada usuário autoriza a própria conta pelo navegador.
- Lembretes internos não exigem SMTP. Para e-mail, configure o envio conforme o ambiente local.
- Importações têm limites de tamanho e estrutura; PDFs precisam conter texto extraível.

Veja o [guia de Economia, Notícias e Agenda](docs/economia-noticias-agenda.md) e o [estado atual](docs/estado-atual.md).

## Dados privados, contas e manutenção

O PostgreSQL fica na rede interna do Docker. Interface e API ficam vinculadas a `127.0.0.1`, para acesso neste computador. **Esta configuração é local e não foi preparada para exposição pública.**

O volume `postgres_data` guarda o banco. `private_storage` guarda arquivos e a chave de criptografia das integrações. Código e migrações ficam no Git; dados, segredos e `.env` não. Commit não substitui backup dos volumes.

A primeira conta criada é administradora. Outras contas podem ser criadas pelo mesmo comando, com dados separados. Para redefinir uma senha, na pasta do projeto:

```bash
docker compose exec backend python -m app.cli reset-password --email "seu-email@exemplo.com"
```

A operação invalida as sessões existentes. No Linux, use `sudo` se necessário. Os comandos de conta também permitem `disable-user`, `grant-admin` e `revoke-admin`.

Links de diagnóstico local: [saúde da API](http://localhost:8000/api/health) e [documentação da API](http://localhost:8000/docs).

## Tecnologias e documentação técnica

| Camada | Tecnologias |
| --- | --- |
| Interface | React, TypeScript, Vite, Recharts |
| Backend | Python, FastAPI, SQLAlchemy, Alembic |
| Banco relacional | PostgreSQL |
| Dados e relatórios | Pandas, ReportLab |
| Execução local | Docker e Docker Compose |

Arquitetura de monólito modular. Recursos centrais não dependem de IA. Consulte [arquitetura](docs/arquitetura.md), [verificação e testes](docs/verificacao.md), [backup](docs/backup.md) e [plano do MVP](docs/plano-mvp.md).

O GitHub Actions verifica backend com PostgreSQL, compilação do frontend e fluxos de navegador com Docker em ambiente descartável. Não publica a aplicação. Deploy fica para uma etapa futura.
