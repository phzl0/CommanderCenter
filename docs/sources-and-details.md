# Fontes, leitura e detalhes (0.3)

A visão geral concentra os indicadores e a leitura rápida. Cada card tem **Ver detalhes**, com endereço próprio (`#/painel/ID`), e um botão para abrir em nova aba. Gráficos completos, tabelas e sugestões de acompanhamento ficam nos detalhes. As sugestões são regras fixas; nenhuma função depende de IA.

## Notícias

Três sites são configurados uma única vez por conta: Agência Brasil (principais e política), G1 Economia (economia e bolsa) e IBGE (indicadores). Desativar ou remover uma fonte não a recria no próximo acesso. O clima tem um card próprio via Open-Meteo.

Em **Fontes**, adicione nome, categoria livre e link HTTPS. **Testar e visualizar** verifica um RSS/Atom ou procura o feed anunciado no HTML do site. A aplicação não transforma qualquer página em feed nem contorna assinaturas. Se o site não anunciar um feed, informe o endereço RSS fornecido por ele. A URL do feed encontrado é salva; mudar a URL exige novo teste.

Cada radar aceita até seis fontes; sem seleção usa as seis primeiras ativas. Há filtros de categoria, inclusão e exclusão por palavras separadas por vírgula. A inclusão aceita qualquer termo; uma exclusão basta para retirar a notícia. O radar mostra até quatro manchetes na visão geral e até 60 nos detalhes. Cada fonte contribui com até 40 itens recentes, respeitando o período escolhido. Links iguais, desconsiderando parâmetros de rastreamento, ou títulos iguais são agrupados.

As notícias exibem manchete, imagem quando disponível, fonte, categoria e data. O resumo fica nos detalhes; o texto completo abre no site original. **Salvar** mantém uma cópia dos metadados em **Ler depois**; o histórico **Já lidas** é individual. Links abertos pelo radar também são marcados como lidos. Isso não garante a disponibilidade futura da página original.

Consultas de fontes têm cache de dez minutos e intervalo mínimo de 30 segundos para atualização manual. Indisponibilidade fica sinalizada; itens de consulta anterior podem aparecer identificados. Sites podem alterar feeds, bloquear consultas ou não fornecer imagens. O aplicativo usa uma imagem substituta visual nesses casos.

RSS e imagens são consultados pelo backend, com HTTPS, limites de tamanho, validação DNS/IP público e redirecionamentos verificados. Imagens exigem sessão e formato raster validado. Endereços locais e redes privadas são recusados. Não existe monitoramento contínuo em segundo plano: a consulta ocorre quando o painel é carregado ou atualizado.

## Empresas e clima

A pesquisa de ações usa um único provedor: Alpha Vantage. Informe empresa, código ou link reconhecido do Yahoo Finance, Google Finance ou TradingView; o link apenas extrai um termo de pesquisa. Escolha uma listagem nos resultados, verificando região e moeda. O código de uma plataforma não é convertido automaticamente para outra.

Pesquisa e preços exigem `ALPHA_VANTAGE_API_KEY` no `.env` e reconstrução/reinício do backend. A chave fica no servidor. Cobertura, limites e atrasos dependem do provedor; o gráfico utiliza fechamentos diários, sem negociação ou cotações em tempo real. Sem chave, os demais recursos continuam funcionando.

Para o clima, pesquise e selecione uma cidade. São salvos nome e coordenadas; não é solicitada geolocalização do navegador. Condições atuais e previsão de sete dias vêm do Open-Meteo e dependem da disponibilidade do serviço. A previsão usa o horário da localidade e não o filtro histórico de dias do dashboard.

## Notificações e exclusões

Operações feitas na interface geram avisos internos e histórico no sino. Falhas de consulta externa também geram avisos, com repetição limitada. Não há notificações nativas do navegador. O histórico retém até 200 entradas; a central mostra as 100 mais recentes.

Exclusões pedem confirmação dentro do aplicativo. Cards, fontes e registros manuais pessoais/financeiros permitem **Desfazer** por dez minutos, pelo aviso ou pela central. Durante esse prazo e depois dele, ficam ocultos de listagens, gráficos e novas exportações. Esta versão usa exclusão lógica no banco; não faz expurgo automático desses registros. O prazo é validado no servidor, por proprietário. Relatórios já gerados são fotografias e permanecem inalterados.

Arquivos, relatórios e tarefas não têm restauração nesta etapa. A confirmação de exclusão de uma importação informa a remoção de análises e relatórios relacionados. O histórico de notificações não é um registro de auditoria: operações diretas pela API não têm os avisos de sucesso criados pela interface.

## Atualização local

```bash
cd ~/Projetos/CommanderCenter
git pull --ff-only
sudo docker compose up --build -d
```

A migração é aditiva e executada na inicialização. Preserve `.env`, `postgres_data` e `private_storage`. Não use `down -v`. Não há configuração de deploy nesta etapa.
