# Conexões pelo sistema

Em **Fontes e conexões → Conexões**, use **Conectar**, autorize no site oficial e volte ao Command Center. Uma janela separada mantém sua tela aberta; se o navegador bloquear a janela, a autorização usa a própria aba. A conclusão atualiza a conta conectada automaticamente. Alguns provedores podem separar a janela de origem; nesses casos, ao voltar à tela, o status é consultado novamente.

Depois de conectado, escolha repositórios, listas ou calendário nos controles existentes. GitHub continua limitado a repositórios públicos; Microsoft e Google continuam somente leitura. Reconectar não altera arquivos nem registros locais.

## Configuração inicial do administrador

O aplicativo Command Center precisa ser cadastrado uma vez no provedor. Isso não é o mesmo que autorizar sua conta pessoal. O cadastro continua no console oficial; o Command mostra o link e a URL de retorno correta.

1. Abra **Configurar aplicativos** em Conexões.
2. Escolha GitHub, Google Calendar ou Microsoft 365.
3. Abra o console oficial e cadastre o aplicativo e a URL de retorno exibida.
4. Copie Client ID e Client Secret para o formulário do Command.
5. Confirme com sua senha atual e salve. Não precisa editar `.env` nem reiniciar os serviços.
6. Clique em **Conectar** e autorize a própria conta no navegador.

No Google, configure a tela de consentimento, habilite Calendar API e, se o aplicativo estiver em teste, inclua a conta de teste. Na Microsoft, registre a URL como plataforma Web; as políticas da organização podem exigir consentimento administrativo. O campo Tenant aceita `organizations`, `common` ou o identificador da organização.

A configuração é compartilhada pela instalação; somente administradores podem consultá-la ou alterá-la. Os segredos são criptografados no banco com a chave já usada para as conexões. Não aparecem em respostas da API. Client Secret vazio mantém o segredo existente somente se o Client ID continuar igual. A origem/URL de retorno é fixa pelo ambiente do servidor, para evitar redirecionamentos arbitrários.

Salvar um aplicativo quando já há contas conectadas exige marcar a confirmação de reconexão. Essa alteração remove as autorizações locais desse serviço e cancela autorizações pendentes. Outros serviços e os dados dos painéis são preservados. Não há revogação automática da autorização no site externo; ela pode ser removida nas configurações do próprio provedor.

As credenciais previamente configuradas no `.env` continuam funcionando até serem substituídas pelo formulário. A cópia no ambiente não é apagada. Preserve banco, volume privado e chave de criptografia nos backups.

## Quem é administrador

Na atualização de uma instalação com uma única conta, ela se torna administradora. Em instalações com várias contas, nenhuma é promovida automaticamente. O primeiro usuário criado em uma instalação nova recebe esse papel; contas seguintes não.

Se precisar atribuir o papel a uma conta existente, o administrador da máquina executa uma única vez:

```bash
sudo docker compose exec backend python -m app.cli grant-admin --email seu-email@dominio.com
```

`grant-admin` atribui o papel e encerra as sessões da conta para exigir novo login. `revoke-admin` remove o papel. O controle do servidor permanece necessário para essa operação; não há botão para um usuário se promover.

## Validação

Testes usam credenciais fictícias e páginas de autorização simuladas. A autorização real depende do cadastro válido no provedor e da aprovação da própria conta no navegador. Nenhuma conta externa é autorizada automaticamente pelos testes.
