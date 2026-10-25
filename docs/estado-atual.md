# Estado atual do Command Center — 0.7

MVP local, privado e independente de IA. Interface compacta em grafite/azul e logo vetorial compartilhado com o favicon.

## Implementado

- Visão geral: cinco cards no máximo, quinto largo, tipos repetidos e detalhes em página própria.
- Notícias: imagens, destaques automáticos a cada dois segundos, categorias e manchetes paginadas.
- Agenda: calendário mensal, seleção do dia, compromissos, afazeres e avisos; lembretes persistentes no Command e por SMTP.
- Dados e arquivos: originais privados, CSV/Excel, texto de PDFs, filtros e cálculos opcionais, análises salvas e exportação de relatórios.
- Fontes e conexões: RSS, GitHub público, Microsoft somente leitura e Google Calendar somente leitura.
- Perfil, avatar, preferências, senha, sessões, notificações e restauração das exclusões compatíveis.
- Clima com busca de cidade, localização opcional e previsão por hora; mercado, indicadores econômicos e registros manuais.

Metas, Tarefas, Meu dia e Projetos saíram do menu. Os dados e APIs anteriores são preservados. Salvas/lidas saíram da interface de notícias. Configurações de cards além do quinto são mantidas ocultas.

## Limites e próximos passos

As conexões reais exigem as credenciais do usuário no ambiente local. E-mail requer SMTP e serviços ligados; não há entrega garantida com o computador desligado. PDFs sem camada de texto exigem OCR; valores e tabelas não são interpretados automaticamente. Cotações/previsões e notícias dependem dos provedores. Marcadores mensais da agenda são locais; Google é consultado no dia selecionado.

Backup/restauração local continua importante, preservando banco, arquivos e chave de criptografia das conexões. Publicação/deploy permanece fora desta etapa.

Consulte [o guia da versão](interface-simples.md) para uso e configuração de e-mail.
