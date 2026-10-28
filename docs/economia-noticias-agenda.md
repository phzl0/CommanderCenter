# Economia, notícias e agenda — 0.8

## Economia

A aba reúne quadrados de 12 empresas brasileiras e gráficos de Selic, dólar, IPCA e PIB. Verde indica valorização e vermelho queda em relação ao fechamento anterior. Os quadrados têm o mesmo tamanho: a seleção inicial não é um ranking por capitalização. Ausência de cotação aparece em cinza, nunca como variação zero inventada.

A brapi permite consultar PETR4, VALE3, ITUB4 e MGLU3 sem chave. Para ampliar a cobertura, use **Configurar cotações** na própria página e informe sua chave brapi. Ela é criptografada, vinculada à sua conta e não retorna ao navegador. Os demais ativos e o histórico dependem da disponibilidade e do plano do provedor. Não há garantia de tempo real. Não é necessário editar o .env para essa chave.

Selic e dólar usam séries do Banco Central; IPCA tem frequência mensal. PIB usa a variação trimestral de volume, com ajuste sazonal, frente ao trimestre anterior, do IBGE. Não representa PIB nominal. Séries mensais/trimestrais mantêm sua frequência, mesmo em um filtro curto. Indisponibilidade externa não impede os outros indicadores de carregar.

Os gráficos permitem selecionar períodos e agrupar por dia, semana ou mês. Taxas usam o último valor do período; contagens e movimentos pessoais são somados. Horas são exibidas quando a fonte fornece essa resolução. Caso contrário, a tela informa que mantém a frequência original. O histórico intradiário de ações depende do provedor.

## Notícias

Cada categoria tem três fontes fixas:

| Categoria | Fontes |
| --- | --- |
| Política | G1 Política, Agência Câmara, Agência Senado |
| Futebol | ge Futebol, UOL Futebol, ESPN Futebol |
| Economia | G1 Economia, InfoMoney, IBGE |

As fontes anteriores são preservadas. Fontes fixas não podem ser excluídas ou editadas. **Adicionar fonte — avançado** guia em três etapas: colar link, conferir nome/categoria e revisar as manchetes antes de salvar. Aceita domínio sem https, procura RSS anunciado e tenta extrair manchetes HTML. Fontes personalizadas podem usar outras categorias.

O leitor aceita respostas de até 12 MB; imagens continuam limitadas a 2 MB. Mantém validação de endereços e proteção contra acesso à rede privada. Sites que bloqueiam robôs, exigem login ou dependem de JavaScript podem não funcionar: aumentar o limite não remove essas restrições. Falhas são isoladas por fonte; não se inventam manchetes. O IBGE apresentou indisponibilidade durante a validação externa; o sistema mostra o aviso correspondente.

## Agenda

O calendário agora inclui resumo do dia, busca, filtro por tipo, navegação direta por data e próximos sete dias. Compromissos locais sobrepostos recebem um aviso. É possível duplicar um registro para amanhã e conferir o envio de lembretes. Afazeres e avisos continuam disponíveis, assim como a leitura do Google Calendar.

Resumo, conflitos e próximos sete dias usam registros locais. A integração Google continua no dia selecionado. Notificações internas funcionam sem SMTP; e-mail exige configuração de envio no servidor. Dados anteriores são preservados.

## Atualização local

Faça o pull e reconstrua os containers. A migração cria as configurações econômicas e identifica as fontes padrão sem apagar registros existentes.

```bash
cd ~/Projetos/CommanderCenter
git pull --ff-only
docker compose up --build -d
```

Mantenha o volume privado e sua chave de criptografia nos backups existentes. Nenhuma configuração de deploy foi adicionada.
