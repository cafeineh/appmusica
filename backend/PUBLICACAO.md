# Publicacao segura

Antes de iniciar o backend em um servidor publico, defina estas variaveis de ambiente:

```powershell
$bytes = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
$env:APP_JWT_SECRET = [Convert]::ToBase64String($bytes)
$env:APP_CORS_ORIGINS = "https://seu-frontend.exemplo.com"
```

`APP_JWT_SECRET` deve ser uma chave aleatoria diferente em cada ambiente. Nunca coloque esse valor no frontend, no Git ou em uma URL.

Inicie o backend com:

```powershell
mvn spring-boot:run
```

Ou gere o JAR:

```powershell
mvn clean package
java -jar target/app-musica-backend-0.0.1-SNAPSHOT.jar
```

## Antes do primeiro deploy

- Use HTTPS para o frontend e backend.
- Configure `APP_CORS_ORIGINS` com a origem exata do frontend, sem `*`.
- Mantenha `appmusica-data.json` fora da pasta publica e faca backup protegido.
- Apague dados de teste antes de iniciar o ambiente publico.
- Para producao, substitua o arquivo JSON por PostgreSQL e os `data URLs` por armazenamento de objetos.
- Atualize `API_BASE` em `frontend/login.js` e `frontend/script.js` para a URL HTTPS do backend.

O backend agora armazena senhas com BCrypt, usa JWT com expiracao e rejeita tokens falsos. O segredo e as origens CORS sao obrigatorios para uma publicacao segura.

## GitHub Pages

1. Publique o repositorio no GitHub.
2. No GitHub, abra `Settings > Pages` e escolha `GitHub Actions` como origem.
3. O workflow `.github/workflows/deploy-pages.yml` publicara a pasta `frontend` a cada push em `main`.
4. Depois de publicar o backend, altere `frontend/config.js` para usar a URL HTTPS real da API e faca um novo push.
5. Configure `APP_CORS_ORIGINS` no backend com a URL gerada pelo GitHub Pages, por exemplo `https://usuario.github.io/appmusica`.

O GitHub Pages nao executa o Spring Boot. O backend precisa estar hospedado separadamente e o repositorio nao deve conter `appmusica-data.json`, senhas ou segredos.

## Backend no Render usando Docker

1. Crie uma conta em `render.com` e escolha `New > Web Service`.
2. Conecte o repositorio GitHub.
3. Em `Root Directory`, informe `backend`.
4. Escolha `Docker` como ambiente.
5. Configure as variaveis `APP_JWT_SECRET` e `APP_CORS_ORIGINS` no painel do Render.
6. Use como `APP_CORS_ORIGINS` a URL do GitHub Pages, sem barra final.
7. Copie a URL HTTPS gerada pelo Render para `frontend/config.js`:

```javascript
window.APP_CONFIG = {
	API_BASE: "https://seu-backend.onrender.com/api",
};
```

8. Faca commit e push. O workflow atualizara o frontend.

O arquivo `backend/Dockerfile` ja esta preparado para esse deploy. No plano gratuito, o servico pode dormir e o armazenamento local pode ser perdido ao reiniciar; para guardar contas e musicas de verdade, use PostgreSQL e armazenamento de objetos.

## Executar baixado no Windows

O arquivo `INICIAR-APP.bat`, na raiz do repositorio, inicia o backend, um servidor local para o frontend e abre a tela de login. O computador precisa ter Java 17+, Maven e Python instalados. Esse arquivo e apenas para uso local; para amigos, envie o link publicado, nao o `.bat`.
