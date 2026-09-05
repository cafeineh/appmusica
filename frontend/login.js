const API_BASE = window.APP_CONFIG?.API_BASE || "http://localhost:8080/api";

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

function ligarBotaoOlho(idBotao, idCampo) {
  const botao = document.getElementById(idBotao);
  const campo = document.getElementById(idCampo);
  botao.addEventListener("click", () => {
    campo.type = campo.type === "password" ? "text" : "password";
  });
}

ligarBotaoOlho("olho-entrar", "entrar-senha");
ligarBotaoOlho("olho-criar", "criar-senha");

function ehEmailValido(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function mostrarErro(idErro, mensagem) {
  const elemento = document.getElementById(idErro);
  elemento.textContent = mensagem;
  elemento.classList.add("visivel");
}

function limparErro(idErro) {
  const elemento = document.getElementById(idErro);
  elemento.textContent = "";
  elemento.classList.remove("visivel");
}

function salvarSessao(dados) {
  localStorage.setItem("appmusica_logado", "true");
  localStorage.setItem("appmusica_token", dados.token);
  localStorage.setItem("appmusica_nome", dados.nome);
  localStorage.setItem("appmusica_username", dados.username);
  localStorage.setItem("appmusica_email", dados.email);
}

async function lerErro(resposta, mensagemPadrao) {
  const corpo = await resposta.json().catch(() => ({}));
  return corpo.erro || mensagemPadrao;
}

formEntrar.addEventListener("submit", async (evento) => {
  evento.preventDefault();
  limparErro("erro-entrar-email");
  limparErro("erro-entrar-senha");

  const email = document.getElementById("entrar-email").value.trim();
  const senha = document.getElementById("entrar-senha").value;

  if (!ehEmailValido(email)) {
    mostrarErro("erro-entrar-email", "Digite um e-mail válido.");
    return;
  }
  if (!senha) {
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
      mostrarErro("erro-entrar-senha", await lerErro(resposta, "E-mail ou senha incorretos."));
      return;
    }

    salvarSessao(await resposta.json());
    window.location.href = "index.html";
  } catch (erro) {
    mostrarErro("erro-entrar-senha", "Não foi possível conectar ao servidor. O backend está rodando?");
  } finally {
    botao.disabled = false;
    botao.textContent = "Entrar";
  }
});

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
  const larguras = ["0%", "30%", "55%", "80%", "100%"];
  medidorForca.style.width = larguras[forca];
  medidorForca.style.background = cores[forca];
});

formCriar.addEventListener("submit", async (evento) => {
  evento.preventDefault();
  ["erro-criar-username", "erro-criar-nome", "erro-criar-email", "erro-criar-senha", "erro-criar-confirmar"].forEach(limparErro);

  const username = document.getElementById("criar-username").value.trim().toLowerCase();
  const nome = document.getElementById("criar-nome").value.trim();
  const email = document.getElementById("criar-email").value.trim();
  const senha = document.getElementById("criar-senha").value;
  const confirmar = document.getElementById("criar-confirmar").value;
  const termos = document.getElementById("criar-termos").checked;

  let valido = true;
  if (!/^[a-z0-9._-]{3,30}$/.test(username)) { mostrarErro("erro-criar-username", "Use 3 a 30 caracteres: letras, números, ponto, hífen ou sublinhado."); valido = false; }
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
      body: JSON.stringify({ username, nome, email, senha }),
    });

    if (!resposta.ok) {
      mostrarErro("erro-criar-email", await lerErro(resposta, "Não foi possível criar a conta."));
      return;
    }

    salvarSessao(await resposta.json());
    window.location.href = "index.html";
  } catch (erro) {
    mostrarErro("erro-criar-email", "Não foi possível conectar ao servidor. O backend está rodando?");
  } finally {
    botao.disabled = false;
    botao.textContent = "Criar conta";
  }
});

document.getElementById("link-esqueci").addEventListener("click", (evento) => {
  evento.preventDefault();
  const link = evento.currentTarget;
  link.textContent = "Em breve — recuperação por e-mail ainda não está disponível";
  link.style.pointerEvents = "none";
});