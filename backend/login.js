/* =========================================================
   Agora ligado a um backend de verdade (Spring Boot).
   O backend precisa estar rodando em http://localhost:8080
   (cd backend && mvn spring-boot:run) para o login funcionar.
========================================================= */
const API_BASE = "http://localhost:8080/api";

const abaEntrar = document.getElementById("aba-entrar");
const abaCriar = document.getElementById("aba-criar");
const formEntrar = document.getElementById("form-entrar");
const formCriar = document.getElementById("form-criar");

function mostrarAba(aba) {
  const entrarAtiva = aba === "entrar";
  abaEntrar.classList.toggle("ativa", entrarAtiva);
  abaCriar.classList.toggle("ativa", !entrarAtiva);
  formEntrar.style.display = entrarAtiva ? "flex" : "none";
  formCriar.style.display = entrarAtiva ? "none" : "flex";
}

abaEntrar.addEventListener("click", () => mostrarAba("entrar"));
abaCriar.addEventListener("click", () => mostrarAba("criar"));

/* ===== Mostrar/ocultar senha ===== */
function ligarBotaoOlho(idBotao, idCampo) {
  const botao = document.getElementById(idBotao);
  const campo = document.getElementById(idCampo);
  botao.addEventListener("click", () => {
    campo.type = campo.type === "password" ? "text" : "password";
  });
}
ligarBotaoOlho("olho-entrar", "entrar-senha");
ligarBotaoOlho("olho-criar", "criar-senha");

/* ===== Validações auxiliares ===== */
function ehEmailValido(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function mostrarErro(idErro, mensagem) {
  const el = document.getElementById(idErro);
  el.textContent = mensagem;
  el.classList.add("visivel");
}

function limparErro(idErro) {
  const el = document.getElementById(idErro);
  el.textContent = "";
  el.classList.remove("visivel");
}

function salvarSessao(dados) {
  localStorage.setItem("appmusica_token", dados.token);
  localStorage.setItem("appmusica_nome", dados.nome);
  localStorage.setItem("appmusica_email", dados.email);
}

/* ===== Login: agora chama o backend de verdade ===== */
formEntrar.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  limparErro("erro-entrar-email");
  limparErro("erro-entrar-senha");

  const email = document.getElementById("entrar-email").value.trim();
  const senha = document.getElementById("entrar-senha").value;

  if (!ehEmailValido(email)) {
    mostrarErro("erro-entrar-email", "Digite um e-mail válido.");
    return;
  }
  if (senha.length < 1) {
    mostrarErro("erro-entrar-senha", "Digite sua senha.");
    return;
  }

  const botao = formEntrar.querySelector(".botao-primario");
  botao.disabled = true;
  botao.textContent = "Entrando...";

  try {
    const resposta = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, senha }),
    });

    if (!resposta.ok) {
      const erro = await resposta.json().catch(() => ({}));
      mostrarErro("erro-entrar-senha", erro.erro || "E-mail ou senha incorretos.");
      return;
    }

    const dados = await resposta.json();
    salvarSessao(dados);
    window.location.href = "index.html";
  } catch (erro) {
    // Isso acontece, por exemplo, se o backend não estiver rodando
    mostrarErro("erro-entrar-senha", "Não foi possível conectar ao servidor. O backend está rodando?");
  } finally {
    botao.disabled = false;
    botao.textContent = "Entrar";
  }
});

/* ===== Medidor de força de senha (só visual, não afeta o backend) ===== */
const campoSenhaCriar = document.getElementById("criar-senha");
const medidorForca = document.getElementById("medidor-forca").querySelector("span");

campoSenhaCriar.addEventListener("input", () => {
  const senha = campoSenhaCriar.value;
  let forca = 0;
  if (senha.length >= 8) forca++;
  if (/[A-Z]/.test(senha)) forca++;
  if (/[0-9]/.test(senha)) forca++;
  if (/[^A-Za-z0-9]/.test(senha)) forca++;

  const cores = ["#ff5f6d", "#ff5f6d", "#e6a13c", "#2fd583", "#2fd583"];
  const larguras = ["10%", "30%", "55%", "80%", "100%"];
  medidorForca.style.width = larguras[forca];
  medidorForca.style.background = cores[forca];
});

/* ===== Criar conta: também chama o backend de verdade ===== */
formCriar.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  ["erro-criar-nome", "erro-criar-email", "erro-criar-senha", "erro-criar-confirmar"].forEach(limparErro);

  const nome = document.getElementById("criar-nome").value.trim();
  const email = document.getElementById("criar-email").value.trim();
  const senha = document.getElementById("criar-senha").value;
  const confirmar = document.getElementById("criar-confirmar").value;
  const termos = document.getElementById("criar-termos").checked;

  let valido = true;
  if (nome.length < 2) { mostrarErro("erro-criar-nome", "Digite seu nome."); valido = false; }
  if (!ehEmailValido(email)) { mostrarErro("erro-criar-email", "Digite um e-mail válido."); valido = false; }
  if (senha.length < 8) { mostrarErro("erro-criar-senha", "A senha precisa ter pelo menos 8 caracteres."); valido = false; }
  if (confirmar !== senha) { mostrarErro("erro-criar-confirmar", "As senhas não coincidem."); valido = false; }
  if (!termos) valido = false;
  if (!valido) return;

  const botao = formCriar.querySelector(".botao-primario");
  botao.disabled = true;
  botao.textContent = "Criando conta...";

  try {
    const resposta = await fetch(`${API_BASE}/auth/registrar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome, email, senha }),
    });

    if (!resposta.ok) {
      const erro = await resposta.json().catch(() => ({}));
      mostrarErro("erro-criar-email", erro.erro || "Não foi possível criar a conta.");
      return;
    }

    const dados = await resposta.json();
    salvarSessao(dados);
    window.location.href = "index.html";
  } catch (erro) {
    mostrarErro("erro-criar-email", "Não foi possível conectar ao servidor. O backend está rodando?");
  } finally {
    botao.disabled = false;
    botao.textContent = "Criar conta";
  }
});

/* ===== "Esqueci minha senha" (ainda não implementado no backend) ===== */
const linkEsqueci = document.getElementById("link-esqueci");
linkEsqueci.addEventListener("click", (ev) => {
  ev.preventDefault();
  linkEsqueci.textContent = "Em breve — depende do backend enviar e-mail de verdade";
  linkEsqueci.style.pointerEvents = "none";
});
