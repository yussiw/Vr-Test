# Sala de Aula VR

App Android que abre a sala de aula low poly (`public/classroom.glb`) e deixa você olhar em volta com o giroscópio do celular. Feito com Three.js e empacotado com Capacitor. O APK é compilado pelo GitHub Actions.

## Gerar o APK

1. Crie um repositório no GitHub e envie **todos** os arquivos desta pasta, incluindo `.github/workflows/build-apk.yml` (pasta oculta).
   ```bash
   git init && git add -A && git commit -m "primeira versão"
   git branch -M main
   git remote add origin https://github.com/SEU_USUARIO/SEU_REPO.git
   git push -u origin main
   ```
2. No GitHub, abra a aba **Actions**. O workflow "Build APK" roda sozinho a cada push (ou clique em **Run workflow**).
3. Quando terminar (uns 5 a 10 min), abra a execução e baixe o artefato **sala-de-aula-vr-apk** (um .zip com o `app-debug.apk`).
4. Passe o APK para o celular e instale (é preciso permitir "instalar apps de fontes desconhecidas").

## Controles

- **Girar o corpo**: olha em volta (giroscópio).
- **Arrastar a tela**: ajusta a direção. Em PC, é assim que se olha.
- **Centralizar**: refaz o ponto de partida.
- **Brilho**: alterna entre 4 níveis de luz.
- **Andar**: mostra um joystick e botões ▲▼ para ajustar a altura da câmera.
- **Cardboard**: tela dividida para óculos de papelão. Toque duas vezes ou use o botão no topo para sair.

## Testar no PC

```bash
npm install
npm run dev
```
