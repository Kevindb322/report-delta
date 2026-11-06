# App Relatório Deltafrigo

App único para **PC e celular**. Funciona como site instalável (PWA) publicado no GitHub Pages. Depois de instalado, funciona sem internet.

## Publicar (uma vez)

1. No **GitHub Desktop**: `File → Add local repository` e escolha esta pasta (**App**). Quando aparecer *"This directory does not appear to be a Git repository"*, clique em **create a repository**. Depois clique em **Create repository**.
2. Clique em **Publish repository**:
   - Name: `report-delta`
   - **Desmarque** *Keep this code private*
3. No site do GitHub, abra o repositório e vá em **Settings → Pages**: escolha Branch **main**, pasta **/ (root)** e clique em **Save**.
4. Espere 1 a 3 minutos. O endereço fica **https://kevindb322.github.io/report-delta/**

## Instalar

- **Celular Android:** abra o endereço no **Chrome** e use ⋮ → **Instalar app**.
  - Evite o Samsung Internet, porque ele bloqueia o envio de anexos.
- **iPhone:** abra no Safari e use Compartilhar → **Adicionar à Tela de Início**.
- **PC:** abra no Chrome ou no Edge e clique no ícone de instalar na barra de endereço.
  - No primeiro "Salvar PDF", escolha a pasta onde os PDFs vão ficar (ex.: a pasta dos relatórios da Deltafrigo). O app lembra a pasta.

## Atualizar depois de uma mudança

1. Em toda versão nova, mude `APP_VERSION` em `app.js` e `CACHE` em `sw.js`. O Claude faz isso quando altera o app.
2. No GitHub Desktop: **Commit to main** → **Push origin**.
3. Os aparelhos mostram **"Versão nova disponível"**.

## Importante

- O site é público. Os relatórios não vão para a internet: ficam só no aparelho de cada técnico.
- Cada PDF leva os dados do relatório dentro dele. Com **"Abrir PDF ou JSON salvo…"** dá para reabrir e editar qualquer PDF, no PC ou no celular.
- Desinstalar o app ou limpar os dados do navegador apaga a lista do aparelho. Os PDFs salvos continuam onde estão.
