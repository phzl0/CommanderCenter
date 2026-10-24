# Centro de informações — versão 0.2

## Mudança de foco

A visão geral é um dashboard configurável com tema escuro, azul principal e acentos ciano/violeta discretos. Projetos e Atividades saíram da navegação; seus registros e APIs continuam preservados. Tarefas, Dados e análises e Relatórios permanecem.

Cada usuário tem seus próprios painéis, ordem, visibilidade, largura, configurações de fonte e período (7, 30 ou 90 dias). Os primeiros seis painéis são criados uma única vez. Remover todos não recria os padrões. Limite de 12 painéis.

## Painéis disponíveis

| Tipo | Origem e comportamento |
|---|---|
| Atividade pessoal | Registro manual de minutos e categoria/nome; exibe tempo ou quantidade de registros por dia. |
| Financeiro pessoal | Receitas/despesas manuais em BRL; dinheiro armazenado em centavos inteiros. Resultado é o fluxo do período, sem saldo inicial. Não há conexão bancária. |
| Tarefas | Eventos históricos de conclusão por dia e distribuição da situação atual. Reabrir e concluir novamente produz outro evento histórico. |
| GitHub | Repositório público no formato `dono/repositorio`; até 100 commits da branch padrão no período, estrelas e issues/PRs abertos. Não usa a conexão do GitHub com o ChatGPT nem acessa repositórios privados. |
| Notícias | IBGE ou RSS de Economia/Política da Agência Brasil. Gráfico representa o recorte recebido (até 30 itens), não o total de publicações nem sentimento. Links abrem a fonte. |
| Indicadores econômicos | Banco Central/SGS: dólar comercial venda (série 1), meta Selic (432), IPCA mensal (433). IPCA usa últimos 12 meses; não há cotação em tempo real. |
| Ações de empresas | Alpha Vantage, fechamento diário da listagem informada. Requer chave local e está sujeito a símbolos, disponibilidade e limites do provedor. Não é feed ao vivo. |
| Planilha | Análise salva com seleção de eixo, valor e soma/média/contagem; até 100 grupos. Usa os filtros da análise, sem reaplicar o seletor de período do dashboard. Pode representar investimentos, preços históricos, orçamento, estudo ou outros indicadores próprios. |

Gráficos disponíveis: área, linha e barras. Cada gráfico tem tabela de dados acessível. Fontes externas mostram origem e horário da consulta, dados vazios ou falha explicitamente; não há demonstrações ou números inventados na aplicação.

## Configuração e registros

**Personalizar** permite mostrar/ocultar, subir/descer, editar, remover e adicionar painéis. A engrenagem de cada painel abre sua configuração. **Registrar dados** abre registros pessoais e financeiros, com edição e exclusão dos últimos 100 registros. Os relatórios também exportam esses dois novos conjuntos.

Sem IA: todos os cálculos são determinísticos. O registro pessoal não monitora automaticamente sua rotina.

## Atualizar a instalação existente

Na pasta do projeto, com backup recomendado dos dados locais:

```bash
git pull --ff-only
sudo docker compose up --build -d
```

A migração `9df8f76e543e` adiciona as tabelas de preferências, painéis e registros. Não remove usuários, projetos, tarefas, atividades, análises ou arquivos existentes. Não use `down -v`, não exclua volumes e não recrie o `.env`.

### Ações de empresas (opcional)

Se desejar essa fonte, obtenha uma chave diretamente no provedor e acrescente ao `.env` local:

```dotenv
ALPHA_VANTAGE_API_KEY=sua_chave_local
```

Recrie o backend com `sudo docker compose up -d backend`. A chave fica apenas no servidor, não é exibida pela API nem precisa ser enviada no chat. Os demais painéis e o sistema continuam funcionando sem ela. Indicadores oficiais do BCB não exigem essa chave.

## Fontes e limites de integração

- https://docs.github.com/en/rest/commits/commits
- https://agenciabrasil.ebc.com.br/feed/
- https://servicodados.ibge.gov.br/api/docs/noticias?versao=3
- https://dadosabertos.bcb.gov.br/
- https://www.alphavantage.co/documentation/

Consultas externas usam hosts HTTPS fixos, tempo limite, limite de resposta e tratamento de falhas. Cache por painel por 10 minutos; atualização manual respeita intervalo mínimo de 30 segundos. Configurações são privadas; registros pessoais e financeiros nunca são enviados às fontes públicas. Disponibilidade, limites e atualidade dos dados dependem de cada provedor.

## Verificação desta etapa

A suíte acrescenta testes de preferências, reordenação, isolamento, exclusão, limite de painéis, cache, falha de fontes, cálculos financeiros, edição de registros, referências de análises e exportações pessoais/financeiras. Provedores usam fixtures nos testes: a suíte não confirma que um serviço público está disponível em tempo real. O teste por navegador também identifica suas fixtures explicitamente e verifica o novo menu, registros, personalização persistente e gráfico de planilha, além das funções anteriores.

Verificação adicional: a janela do IPCA permanece nos últimos 12 meses mesmo quando o usuário alterna o período dos demais painéis. A suíte local atual tem 23 testes aprovados.
