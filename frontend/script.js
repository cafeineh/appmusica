const API_BASE = window.APP_CONFIG?.API_BASE || "http://localhost:8080/api";

function escaparHtml(valor) {
  return String(valor ?? "").replace(/[&<>"']/g, (caractere) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[caractere]));
}

/* =========================================================
   PROTEÇÃO DE ACESSO (mock)
   Se não houver "login" salvo localmente, manda pra tela de
   login. Lembre-se: isso não é segurança real (ver aviso em
   login.js) — é só pra simular o fluxo de app com login.
========================================================= */
// O Live Server usa outra origem do arquivo local. O app continua em modo
// visitante para não perder a tela ao trocar entre file:// e http://.
if (localStorage.getItem("appmusica_logado") !== "true") {
  localStorage.setItem("appmusica_logado", "true");
}

/* =========================================================
   BASE DE DADOS (por enquanto local; no futuro isso vem do
   backend Java via fetch, como já vimos antes)
========================================================= */
let catalogo = [];

if (!localStorage.getItem("appmusica_catalogo_limpo_v1")) {
  localStorage.removeItem("appmusica_catalogo");
  localStorage.setItem("appmusica_catalogo_limpo_v1", "true");
}

// Playlists criadas pelo usuário. "Curtidas" é fixa e especial.
let playlists = [
  // { id, nome, faixasIds: [] }  <- exemplo de formato
];

let proximoIdPlaylist = 1;
let proximoIdMusica = catalogo.length + 1;

/* =========================================================
   PERSISTÊNCIA LOCAL (localStorage)
   Isso guarda os dados no navegador do usuário, então eles
   sobrevivem a um recarregamento da página. Não é um banco
   de dados de verdade — é só pra essa fase de estudo. Quando
   você conectar o backend, isso tudo passa a vir da API.
========================================================= */
function salvarEstado() {
  localStorage.setItem("appmusica_catalogo", JSON.stringify(catalogo));
  localStorage.setItem("appmusica_playlists", JSON.stringify(playlists));
}

function carregarEstado() {
  const catalogoSalvo = localStorage.getItem("appmusica_catalogo");
  const playlistsSalvas = localStorage.getItem("appmusica_playlists");
  if (catalogoSalvo) catalogo = JSON.parse(catalogoSalvo);
  if (playlistsSalvas) playlists = JSON.parse(playlistsSalvas);
  const titulosDemo = new Set(["Chicago", "Heaven Can Wait", "All I Want Is You"]);
  catalogo = catalogo.filter((musica) => !titulosDemo.has(musica.titulo));
  playlists = playlists.map((playlist) => ({
    ...playlist,
    capaUrl: playlist.capaUrl && !playlist.capaUrl.startsWith("blob:") ? playlist.capaUrl : "",
  }));
  proximoIdMusica = Math.max(0, ...catalogo.map((m) => m.id)) + 1;
  proximoIdPlaylist = Math.max(0, ...playlists.map((p) => p.id)) + 1;
}
carregarEstado();

async function sincronizarCatalogo() {
  try {
    const resposta = await fetch(`${API_BASE}/musicas`);
    if (!resposta.ok) return;
    const remotos = (await resposta.json())
      .filter((musica) => musica.fileUrl)
      .map((musica) => ({
        id: musica.id,
        titulo: musica.title,
        artista: musica.artist,
        arquivo: musica.fileUrl,
        genero: musica.genre || "Sem gênero",
        letra: musica.lyrics || "Letra não informada pelo criador.",
        capaUrl: musica.coverUrl || "",
        curtida: false,
        ownerUsername: musica.ownerUsername,
      }));
    const porId = new Map(catalogo.map((musica) => [musica.id, musica]));
    remotos.forEach((musica) => porId.set(musica.id, { ...porId.get(musica.id), ...musica }));
    catalogo = [...porId.values()];
    proximoIdMusica = Math.max(0, ...catalogo.map((musica) => musica.id)) + 1;
    salvarEstado();
    rerenderizarTudo();
  } catch (erro) {
    // O catálogo local continua disponível quando o backend está offline.
  }
}
sincronizarCatalogo();

/* =========================================================
   BUSCA "APROXIMADA" (tolera erro de digitação)
   Ideia: primeiro tenta achar como substring normal; se não
   achar, compara palavra por palavra usando "distância de
   Levenshtein" — uma forma de medir quão parecidas duas
   palavras são (quantas letras precisam mudar pra uma virar
   a outra). Pesquise esse termo se quiser entender a fundo.
========================================================= */
function normalizar(texto) {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentos
    .toLowerCase()
    .trim();
}

function distanciaLevenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  return dp[m][n];
}

function correspondeAproximado(texto, consulta) {
  const t = normalizar(texto);
  const c = normalizar(consulta);
  if (!c) return false;
  if (t.includes(c)) return true; // caminho rápido: substring exata

  const palavrasTexto = t.split(/\s+/);
  const palavrasConsulta = c.split(/\s+/);

  // Toda palavra digitada precisa "parecer" com alguma palavra do texto
  return palavrasConsulta.every((pc) =>
    palavrasTexto.some((pt) => distanciaLevenshtein(pc, pt) <= Math.max(1, Math.floor(pc.length / 3)))
  );
}

function buscarMusicas(consulta) {
  if (!consulta.trim()) return [];
  return catalogo.filter(
    (m) =>
      correspondeAproximado(m.titulo, consulta) ||
      correspondeAproximado(m.artista, consulta) ||
      correspondeAproximado(m.letra, consulta)
  );
}

/* =========================================================
   ELEMENTOS DA PÁGINA
========================================================= */
const player = document.getElementById("player");
const tocadorInfo = document.getElementById("tocador-info");
const tocandoAgoraEl = document.getElementById("tocando-agora");
const tocandoAutorEl = document.getElementById("tocando-autor");

const btnPlay = document.getElementById("btn-play");
const iconePlay = document.getElementById("icone-play");
const iconePause = document.getElementById("icone-pause");
const btnAnterior = document.getElementById("btn-anterior");
const btnProximo = document.getElementById("btn-proximo");

const barraProgresso = document.getElementById("progresso");
const tempoAtualEl = document.getElementById("tempo-atual");
const tempoTotalEl = document.getElementById("tempo-total");

const biblioteca = document.getElementById("biblioteca");
const btnExpandir = document.getElementById("btn-expandir");
const btnNovaPlaylist = document.getElementById("btn-nova-playlist");
const listaPlaylistsEl = document.getElementById("lista-playlists");

const btnNotificacoes = document.getElementById("btn-notificacoes");
const popoverNotificacoes = document.getElementById("popover-notificacoes");
const btnMensagens = document.getElementById("btn-mensagens");
const popoverMensagens = document.getElementById("popover-mensagens");

const btnCurtir = document.getElementById("btn-curtir");
const btnEmbaralhar = document.getElementById("btn-embaralhar");
const btnRepetir = document.getElementById("btn-repetir");
const btnVolume = document.getElementById("btn-volume");
const popoverVolume = document.getElementById("popover-volume");
const sliderVolume = document.getElementById("slider-volume");

const btnGenero = document.getElementById("btn-genero");
const btnHome = document.getElementById("btn-home");
const btnPremium = document.getElementById("btn-premium");
const avatar = document.getElementById("avatar");
const popoverPerfil = document.getElementById("popover-perfil");

const campoBusca = document.getElementById("campo-busca");
const sugestoesBusca = document.getElementById("sugestoes-busca");
const cardsDescubra = document.getElementById("cards-descubra");
const configTema = document.getElementById("config-tema");

const modalFundo = document.getElementById("modal-fundo");
const modalTitulo = document.getElementById("modal-titulo");
const modalCorpo = document.getElementById("modal-corpo");
const modalFechar = document.getElementById("modal-fechar");

let embaralharAtivo = false;
let modoRepeticao = "off"; // "off" | "todas" | "uma"
let filaAtual = []; // lista de músicas tocando "nesse contexto" (home, playlist, busca...)
let indiceAtual = -1;
let layoutAtual = localStorage.getItem("appmusica_layout") || "lista";
let temaEscuro = localStorage.getItem("appmusica_tema") !== "claro";

function aplicarTema() {
  document.body.dataset.tema = temaEscuro ? "escuro" : "claro";
  configTema.checked = temaEscuro;
  localStorage.setItem("appmusica_tema", temaEscuro ? "escuro" : "claro");
}

function arquivoComoDataUrl(arquivo) {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(leitor.result);
    leitor.onerror = reject;
    leitor.readAsDataURL(arquivo);
  });
}

function aplicarLayout(layout) {
  layoutAtual = layout;
  localStorage.setItem("appmusica_layout", layout);
  document.body.dataset.layout = layout;
  document.querySelectorAll(".botao-layout").forEach((botao) => {
    botao.classList.toggle("ativo", botao.dataset.layout === layout);
  });
  rerenderizarTudo();
}

/* =========================================================
   RENDERIZAÇÃO DE UMA LINHA DE MÚSICA (reutilizável)
   Em vez de escrever o HTML de cada música à mão (como no
   início do projeto), agora ele é gerado a partir dos dados.
   Isso é o que permite curtir, buscar e organizar em
   playlists dinamicamente.
========================================================= */
function criarLinhaMusica(musica, fila) {
  const li = document.createElement("li");
  li.className = "tracklist-item";
  li.dataset.id = musica.id;

  const inicial = musica.titulo.charAt(0).toUpperCase();

  li.innerHTML = `
    <span class="faixa-capa" ${musica.capaUrl ? `style="background-image:url('${escaparHtml(musica.capaUrl)}')"` : ""}>
      ${musica.capaUrl ? "" : escaparHtml(inicial)}
      <span class="play-overlay" aria-hidden="true">▶</span>
    </span>
    <span class="faixa-info">
      <span class="faixa-titulo">${escaparHtml(musica.titulo)}</span>
      <span class="faixa-artista">${escaparHtml(musica.artista)}</span>
    </span>
    <button class="faixa-curtir ${musica.curtida ? "curtido" : ""}" title="Curtir" aria-label="Curtir">
      <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor"><path d="M10 17s-6.5-4-6.5-8.7A3.8 3.8 0 0 1 10 6a3.8 3.8 0 0 1 6.5 2.3C16.5 13 10 17 10 17Z"/></svg>
    </button>
    <button class="faixa-comentar" title="Comentários" aria-label="Comentários">
      <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 4h12a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H9l-4 3v-3H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"/><path d="M6 8h8M6 11h5" stroke-linecap="round"/></svg>
    </button>
    <button class="faixa-add" title="Adicionar à playlist" aria-label="Adicionar à playlist">
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M8 3v10M3 8h10" stroke-linecap="round"/></svg>
    </button>
  `;

  const usernameAtual = localStorage.getItem("appmusica_username");
  if (musica.ownerUsername && musica.ownerUsername === usernameAtual) {
    const acoes = document.createElement("span");
    acoes.className = "faixa-acoes-proprietario";
    acoes.innerHTML = '<button class="faixa-editar" title="Editar música" aria-label="Editar música">✎</button><button class="faixa-excluir" title="Excluir música" aria-label="Excluir música">×</button>';
    li.appendChild(acoes);
    acoes.querySelector(".faixa-editar").addEventListener("click", (ev) => { ev.stopPropagation(); editarMusica(musica); });
    acoes.querySelector(".faixa-excluir").addEventListener("click", (ev) => { ev.stopPropagation(); excluirMusica(musica); });
  }

  // Clicar na linha (fora dos botões) toca a música
  li.addEventListener("click", () => {
    tocarNaFila(fila, fila.findIndex((m) => m.id === musica.id));
  });

  // Curtir (não deixa o clique "vazar" pra linha e tocar a música)
  li.querySelector(".faixa-curtir").addEventListener("click", (ev) => {
    ev.stopPropagation();
    musica.curtida = !musica.curtida;
    salvarEstado();
    rerenderizarTudo();
  });

  // Adicionar à playlist
  li.querySelector(".faixa-add").addEventListener("click", (ev) => {
    ev.stopPropagation();
    abrirModalAdicionarPlaylist(musica);
  });

  li.querySelector(".faixa-comentar").addEventListener("click", (ev) => {
    ev.stopPropagation();
    abrirComentarios(musica);
  });

  if (indiceAtual !== -1 && filaAtual[indiceAtual] && filaAtual[indiceAtual].id === musica.id) {
    li.classList.add("ativa");
  }

  return li;
}

function cabecalhoApi() {
  const token = localStorage.getItem("appmusica_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function editarMusica(musica) {
  abrirModal("Editar música", `<label class="campo-label">Título</label><input id="editar-musica-titulo" class="campo-texto" value="${escaparHtml(musica.titulo)}"><label class="campo-label">Artista</label><input id="editar-musica-artista" class="campo-texto" value="${escaparHtml(musica.artista)}"><button class="botao-primario" id="salvar-edicao-musica">Salvar alterações</button>`);
  document.getElementById("salvar-edicao-musica").addEventListener("click", async () => {
    const resposta = await fetch(`${API_BASE}/musicas/${musica.id}`, { method: "PUT", headers: { ...cabecalhoApi(), "Content-Type": "application/json" }, body: JSON.stringify({ title: document.getElementById("editar-musica-titulo").value.trim(), artist: document.getElementById("editar-musica-artista").value.trim(), fileUrl: musica.arquivo, coverUrl: musica.capaUrl, genre: musica.genero, lyrics: musica.letra }) });
    if (!resposta.ok) return abrirModal("Não foi possível editar", "<p>Somente quem enviou a música pode alterá-la.</p>");
    const atualizada = await resposta.json();
    Object.assign(musica, { titulo: atualizada.title, artista: atualizada.artist });
    salvarEstado();
    fecharModal();
    rerenderizarTudo();
  });
}

function excluirMusica(musica) {
  abrirModal("Excluir música", `<p>Excluir <strong>${escaparHtml(musica.titulo)}</strong>?</p><button class="botao-secundario botao-perigo" id="confirmar-exclusao-musica">Excluir</button>`);
  document.getElementById("confirmar-exclusao-musica").addEventListener("click", async () => {
    const resposta = await fetch(`${API_BASE}/musicas/${musica.id}`, { method: "DELETE", headers: cabecalhoApi() });
    if (!resposta.ok) return abrirModal("Não foi possível excluir", "<p>Somente quem enviou a música pode excluí-la.</p>");
    catalogo = catalogo.filter((item) => item.id !== musica.id);
    salvarEstado();
    fecharModal();
    rerenderizarTudo();
  });
}

function renderizarLista(container, musicas, fila, mensagemVazio) {
  if (!container) return;
  container.innerHTML = "";
  container.classList.toggle("layout-grade", layoutAtual === "grade");
  container.classList.toggle("layout-compacto", layoutAtual === "compacto");
  if (musicas.length === 0) {
    const vazio = document.createElement("p");
    vazio.className = "estado-vazio";
    vazio.textContent = mensagemVazio || "Nada por aqui ainda.";
    container.appendChild(vazio);
    return;
  }
  musicas.forEach((m) => container.appendChild(criarLinhaMusica(m, fila)));
}

function renderizarCardsDescubra() {
  cardsDescubra.innerHTML = "";
  if (catalogo.length === 0) {
    cardsDescubra.innerHTML = `<p class="estado-vazio estado-descubra-vazio">Sua descoberta começa quando você publicar uma música.</p>`;
    return;
  }
  catalogo.slice(0, 4).forEach((musica, indice) => {
    const card = document.createElement("button");
    card.className = `card-recomendacao card-rec-${(indice % 4) + 1}`;
    card.type = "button";
    card.innerHTML = `
      <span class="card-capa" ${musica.capaUrl ? `style="background-image:url('${escaparHtml(musica.capaUrl)}')"` : ""}>${musica.capaUrl ? "" : escaparHtml(musica.titulo.charAt(0))}</span>
      <span class="card-dados"><strong>${escaparHtml(musica.titulo)}</strong><small>${escaparHtml(musica.artista)}</small></span>
      <span class="play-overlay card-play-overlay" aria-hidden="true">▶</span>
    `;
    card.addEventListener("click", () => tocarNaFila(catalogo, catalogo.findIndex((item) => item.id === musica.id)));
    cardsDescubra.appendChild(card);
  });
}

/* =========================================================
   TOCAR MÚSICA
========================================================= */
function tocarNaFila(fila, indice) {
  if (indice < 0 || indice >= fila.length) return;

  filaAtual = fila;
  indiceAtual = indice;
  const musica = fila[indice];

  player.src = musica.arquivo;
  player.play();

  const capaAtual = document.getElementById("capa-atual");
  const capaAtualImagem = capaAtual.querySelector(".capa-atual-imagem");
  capaAtualImagem.style.backgroundImage = musica.capaUrl ? `url("${musica.capaUrl}")` : "";
  capaAtual.classList.toggle("sem-capa", !musica.capaUrl);
  tocadorInfo.classList.remove("visivel");
  void tocadorInfo.offsetWidth;
  tocadorInfo.classList.add("visivel");

  tocandoAgoraEl.textContent = musica.titulo;
  tocandoAutorEl.textContent = musica.artista;
  btnCurtir.classList.toggle("curtido", musica.curtida);

  rerenderizarTudo(); // atualiza destaque "ativa" em todas as listas visíveis
}

btnPlay.addEventListener("click", () => {
  if (indiceAtual === -1) {
    if (filaAtual.length > 0) tocarNaFila(filaAtual, 0);
    return;
  }
  if (player.paused) player.play();
  else player.pause();
});

btnAnterior.addEventListener("click", () => {
  if (embaralharAtivo) {
    tocarIndiceAleatorio();
  } else {
    tocarNaFila(filaAtual, indiceAtual - 1);
  }
});

btnProximo.addEventListener("click", () => {
  if (embaralharAtivo) {
    tocarIndiceAleatorio();
  } else {
    tocarNaFila(filaAtual, indiceAtual + 1);
  }
});

function tocarIndiceAleatorio() {
  if (filaAtual.length <= 1) {
    tocarNaFila(filaAtual, 0);
    return;
  }
  let proximo = indiceAtual;
  while (proximo === indiceAtual) {
    proximo = Math.floor(Math.random() * filaAtual.length);
  }
  tocarNaFila(filaAtual, proximo);
}

player.addEventListener("play", () => {
  tocadorInfo.classList.add("visivel");
  iconePlay.style.display = "none";
  iconePause.style.display = "block";
});

player.addEventListener("pause", () => {
  iconePlay.style.display = "block";
  iconePause.style.display = "none";
});

player.addEventListener("ended", () => {
  if (modoRepeticao === "uma") {
    tocarNaFila(filaAtual, indiceAtual);
    return;
  }
  if (embaralharAtivo) {
    tocarIndiceAleatorio();
    return;
  }
  const proximo = indiceAtual + 1;
  if (proximo < filaAtual.length) {
    tocarNaFila(filaAtual, proximo);
  } else if (modoRepeticao === "todas") {
    tocarNaFila(filaAtual, 0);
  }
});

/* ===== Curtir a música que está tocando agora (botão do player) ===== */
btnCurtir.addEventListener("click", () => {
  if (indiceAtual === -1) return;
  const musica = filaAtual[indiceAtual];
  musica.curtida = !musica.curtida;
  btnCurtir.classList.toggle("curtido", musica.curtida);
  salvarEstado();
  rerenderizarTudo();
});

/* ===== Embaralhar / Repetir ===== */
btnEmbaralhar.addEventListener("click", () => {
  embaralharAtivo = !embaralharAtivo;
  btnEmbaralhar.classList.toggle("ativo", embaralharAtivo);
});

btnRepetir.addEventListener("click", () => {
  if (modoRepeticao === "off") modoRepeticao = "todas";
  else if (modoRepeticao === "todas") modoRepeticao = "uma";
  else modoRepeticao = "off";

  btnRepetir.classList.toggle("ativo", modoRepeticao !== "off");
  btnRepetir.setAttribute("data-modo", modoRepeticao === "uma" ? "uma" : "");
});

/* ===== Progresso ===== */
function formatarTempo(segundos) {
  if (isNaN(segundos)) return "0:00";
  const min = Math.floor(segundos / 60);
  const seg = Math.floor(segundos % 60).toString().padStart(2, "0");
  return `${min}:${seg}`;
}

player.addEventListener("timeupdate", () => {
  if (!player.duration) return;
  barraProgresso.value = (player.currentTime / player.duration) * 100;
  tempoAtualEl.textContent = formatarTempo(player.currentTime);
});

player.addEventListener("loadedmetadata", () => {
  tempoTotalEl.textContent = formatarTempo(player.duration);
});

barraProgresso.addEventListener("input", () => {
  if (!player.duration) return;
  player.currentTime = (barraProgresso.value / 100) * player.duration;
});

/* ===== Volume: mudo + regulagem real ===== */
btnVolume.addEventListener("click", (ev) => {
  ev.stopPropagation();
  fecharPopoversMenos(popoverVolume);
  popoverVolume.classList.toggle("aberto");
});

sliderVolume.addEventListener("input", () => {
  player.volume = sliderVolume.value / 100;
  player.muted = false;
  atualizarIconeVolume();
});

function alternarMudo() {
  player.muted = !player.muted;
  atualizarIconeVolume();
}

function atualizarIconeVolume() {
  btnVolume.classList.toggle("ativo", player.muted || player.volume === 0);
}

/* =========================================================
   SIDEBAR: expandir / criar playlist / mostrar playlists
========================================================= */
btnExpandir.addEventListener("click", () => {
  biblioteca.classList.toggle("expandida");
});

function renderizarSidebar() {
  listaPlaylistsEl.innerHTML = "";

  playlists.forEach((playlist) => {
    const wrap = document.createElement("div");
    wrap.className = "biblioteca-bloco";
    const item = document.createElement("button");
    item.className = "biblioteca-item";
    item.title = playlist.nome;
    item.innerHTML = `
      <span class="biblioteca-item-capa" ${playlist.capaUrl ? `style="background-image:url('${playlist.capaUrl}')"` : ""}>
        ${playlist.capaUrl ? "" : playlist.nome.charAt(0).toUpperCase()}
        <span class="play-overlay biblioteca-play-overlay" aria-hidden="true">▶</span>
      </span>
      <span class="biblioteca-item-nome">${escaparHtml(playlist.nome)}</span>
    `;
    item.addEventListener("click", () => abrirBiblioteca("playlist", playlist.id));
    item.querySelector(".biblioteca-play-overlay").addEventListener("click", (evento) => {
      evento.stopPropagation();
      const faixas = playlist.faixasIds.map((id) => catalogo.find((musica) => musica.id === id)).filter(Boolean);
      if (faixas.length > 0) tocarNaFila(faixas, 0);
    });
    wrap.appendChild(item);
    listaPlaylistsEl.appendChild(wrap);
  });
}

// Curtidas e playlists são páginas internas, não sublistas escondidas na barra.
const btnCurtidas = document.getElementById("btn-curtidas");
btnCurtidas.addEventListener("click", () => abrirBiblioteca("curtidas"));

function abrirBiblioteca(tipo, playlistId) {
  const titulo = document.getElementById("biblioteca-titulo-view");
  const subtitulo = document.getElementById("biblioteca-subtitulo-view");
  const acoes = document.getElementById("biblioteca-acoes");
  const lista = document.getElementById("biblioteca-lista");
  acoes.innerHTML = "";

  if (tipo === "curtidas") {
    const faixas = catalogo.filter((musica) => musica.curtida);
    titulo.textContent = "Curtidas";
    subtitulo.textContent = "As músicas que você guardou para ouvir depois.";
    renderizarLista(lista, faixas, faixas, "Você ainda não curtiu nenhuma música.");
  } else {
    const playlist = playlists.find((item) => item.id === playlistId);
    if (!playlist) return;
    const faixas = playlist.faixasIds.map((id) => catalogo.find((musica) => musica.id === id)).filter(Boolean);
    titulo.textContent = playlist.nome;
    subtitulo.textContent = `${faixas.length} ${faixas.length === 1 ? "música" : "músicas"} nesta playlist.`;
    acoes.innerHTML = `
      <button class="botao-pequeno" id="editar-playlist">Editar playlist</button>
      <button class="botao-pequeno botao-perigo" id="excluir-playlist">Excluir</button>
    `;
    renderizarLista(lista, faixas, faixas, "Adicione músicas usando o botão + na biblioteca.");
    document.getElementById("editar-playlist").addEventListener("click", () => abrirModalEditarPlaylist(playlist));
    document.getElementById("excluir-playlist").addEventListener("click", () => confirmarExclusaoPlaylist(playlist));
  }
  mostrarView("view-biblioteca");
}

function abrirModalEditarPlaylist(playlist) {
  abrirModal("Editar playlist", `
    <label class="campo-label" for="editar-nome-playlist">Nome</label>
    <input type="text" id="editar-nome-playlist" class="campo-texto" value="${escaparHtml(playlist.nome)}" maxlength="60" />
    <label class="campo-label" for="editar-capa-playlist">Foto da playlist</label>
    <input type="file" id="editar-capa-playlist" class="campo-arquivo" accept="image/*" />
    <button class="botao-primario" id="salvar-edicao-playlist">Salvar alterações</button>
  `);
  document.getElementById("salvar-edicao-playlist").addEventListener("click", async () => {
    const nome = document.getElementById("editar-nome-playlist").value.trim();
    const capa = document.getElementById("editar-capa-playlist").files[0];
    if (!nome) return;
    playlist.nome = nome;
    if (capa) playlist.capaUrl = await arquivoComoDataUrl(capa);
    salvarEstado();
    renderizarSidebar();
    fecharModal();
    abrirBiblioteca("playlist", playlist.id);
  });
}

function confirmarExclusaoPlaylist(playlist) {
  abrirModal("Excluir playlist", `
    <p>Excluir <strong>${escaparHtml(playlist.nome)}</strong>? As músicas não serão apagadas do catálogo.</p>
    <div class="view-acoes">
      <button class="botao-secundario" id="cancelar-exclusao">Cancelar</button>
      <button class="botao-secundario botao-perigo" id="confirmar-exclusao">Excluir playlist</button>
    </div>
  `);
  document.getElementById("cancelar-exclusao").addEventListener("click", fecharModal);
  document.getElementById("confirmar-exclusao").addEventListener("click", () => {
    playlists = playlists.filter((item) => item.id !== playlist.id);
    salvarEstado();
    renderizarSidebar();
    fecharModal();
    mostrarView("view-inicio");
  });
}

/* ===== Criar nova playlist (modal próprio, sem usar prompt/alert) ===== */
btnNovaPlaylist.addEventListener("click", () => {
  abrirModal("Nova playlist", `
    <label class="campo-label">Nome da playlist</label>
    <input type="text" id="input-nome-playlist" class="campo-texto" placeholder="Ex: Pra treinar" maxlength="60" />
    <label class="campo-label" for="input-capa-playlist">Foto da playlist</label>
    <input type="file" id="input-capa-playlist" class="campo-arquivo" accept="image/*" />
    <button class="botao-primario" id="confirmar-nova-playlist">Criar</button>
  `);

  document.getElementById("confirmar-nova-playlist").addEventListener("click", async () => {
    const nome = document.getElementById("input-nome-playlist").value.trim();
    if (!nome) return;
    const arquivoCapa = document.getElementById("input-capa-playlist").files[0];
    const capaUrl = arquivoCapa ? await arquivoComoDataUrl(arquivoCapa) : "";
    playlists.push({ id: proximoIdPlaylist++, nome, capaUrl, faixasIds: [] });
    salvarEstado();
    renderizarSidebar();
    fecharModal();
  });
});

function abrirModalAdicionarPlaylist(musica) {
  if (playlists.length === 0) {
    abrirModal("Adicionar à playlist", `<p class="estado-vazio">Você ainda não criou nenhuma playlist. Crie uma primeiro pelo botão "+" na barra lateral.</p>`);
    return;
  }

  const opcoes = playlists
    .map((p) => `<button class="opcao-playlist" data-id="${p.id}">${escaparHtml(p.nome)}</button>`)
    .join("");

  abrirModal("Adicionar à playlist", `<div class="lista-opcoes-playlist">${opcoes}</div>`);

  modalCorpo.querySelectorAll(".opcao-playlist").forEach((botao) => {
    botao.addEventListener("click", () => {
      const playlist = playlists.find((p) => p.id === Number(botao.dataset.id));
      if (!playlist.faixasIds.includes(musica.id)) {
        playlist.faixasIds.push(musica.id);
        salvarEstado();
        rerenderizarTudo();
      }
      fecharModal();
    });
  });
}

function abrirComentarios(musica) {
  const chave = `appmusica_comentarios_${musica.id}`;
  const comentarios = JSON.parse(localStorage.getItem(chave) || "[]");
  const lista = comentarios.length
    ? comentarios.map((comentario) => `<article class="comentario"><strong>${escaparHtml(comentario.autor)}</strong><p>${escaparHtml(comentario.texto)}</p><time>${escaparHtml(comentario.data)}</time></article>`).join("")
    : `<p class="estado-vazio">Ainda não há comentários. Seja a primeira pessoa a comentar.</p>`;

  abrirModal(`Comentários · ${musica.titulo}`, `
    <div class="comentarios-lista" id="comentarios-lista">${lista}</div>
    <form class="comentario-form" id="comentario-form">
      <label class="campo-label" for="novo-comentario">Compartilhe o que achou</label>
      <textarea id="novo-comentario" class="campo-texto" rows="2" maxlength="280" placeholder="Escreva um comentário..."></textarea>
      <button class="botao-primario" type="submit">Publicar comentário</button>
    </form>
  `);
  document.getElementById("comentario-form").addEventListener("submit", (evento) => {
    evento.preventDefault();
    const campo = document.getElementById("novo-comentario");
    const texto = campo.value.trim();
    if (!texto) return;
    comentarios.push({ autor: localStorage.getItem("appmusica_nome") || "Você", texto, data: "agora" });
    localStorage.setItem(chave, JSON.stringify(comentarios));
    abrirComentarios(musica);
  });
}

/* =========================================================
   MODAL GENÉRICO (substitui alert()/prompt() por algo mais
   profissional, já que aqueles travam a página inteira)
========================================================= */
function abrirModal(titulo, htmlCorpo) {
  modalTitulo.textContent = titulo;
  modalCorpo.innerHTML = htmlCorpo;
  modalFundo.classList.add("aberto");
}

function fecharModal() {
  modalFundo.classList.remove("aberto");
}

modalFechar.addEventListener("click", fecharModal);
modalFundo.addEventListener("click", (ev) => {
  if (ev.target === modalFundo) fecharModal();
});

/* =========================================================
   POPOVERS (notificações, mensagens, volume, perfil)
========================================================= */
function fecharPopoversMenos(manter) {
  [popoverNotificacoes, popoverMensagens, popoverVolume, popoverPerfil].forEach((p) => {
    if (p !== manter) p.classList.remove("aberto");
  });
}

btnNotificacoes.addEventListener("click", (ev) => {
  ev.stopPropagation();
  const aberto = popoverNotificacoes.classList.contains("aberto");
  fecharPopoversMenos(null);
  if (!aberto) popoverNotificacoes.classList.add("aberto");
});

btnMensagens.addEventListener("click", (ev) => {
  ev.stopPropagation();
  const aberto = popoverMensagens.classList.contains("aberto");
  fecharPopoversMenos(null);
  if (!aberto) popoverMensagens.classList.add("aberto");
});

avatar.addEventListener("click", (ev) => {
  ev.stopPropagation();
  const aberto = popoverPerfil.classList.contains("aberto");
  fecharPopoversMenos(null);
  if (!aberto) popoverPerfil.classList.add("aberto");
});

document.addEventListener("click", () => fecharPopoversMenos(null));

/* =========================================================
   NAVEGAÇÃO ENTRE "PÁGINAS" (views)
   Como é tudo num site só (sem recarregar), cada "página" é
   uma <section class="view">, e só uma fica visível por vez.
========================================================= */
function mostrarView(id) {
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("ativa"));
  document.getElementById(id).classList.add("ativa");
  fecharPopoversMenos(null);
}

btnHome.addEventListener("click", () => mostrarView("view-inicio"));
btnPremium.addEventListener("click", () => mostrarView("view-premium"));

configTema.addEventListener("change", () => {
  temaEscuro = configTema.checked;
  aplicarTema();
});

document.querySelectorAll(".chave-opcao").forEach((opcao) => {
  opcao.addEventListener("click", (evento) => {
    if (evento.target.tagName === "INPUT") return;
    const checkbox = opcao.querySelector("input");
    if (checkbox.disabled) return;
    evento.preventDefault();
    checkbox.checked = !checkbox.checked;
    checkbox.dispatchEvent(new Event("change", { bubbles: true }));
  });
});

document.querySelectorAll("[data-ir-para]").forEach((el) => {
  el.addEventListener("click", () => mostrarView(el.dataset.irPara));
});

const btnEncontrarAmigos = document.getElementById("btn-encontrar-amigos");
if (btnEncontrarAmigos) {
  btnEncontrarAmigos.addEventListener("click", async () => {
    const username = document.getElementById("campo-amigos").value.trim().toLowerCase();
    const resultado = document.getElementById("resultado-amigos");
    if (!username) {
      resultado.textContent = "Digite um nome de usuário.";
      return;
    }
    try {
      const resposta = await fetch(`${API_BASE}/usuarios/buscar?username=${encodeURIComponent(username)}`);
      const pessoas = await resposta.json();
      resultado.innerHTML = pessoas.length
        ? pessoas.map((pessoa) => `<strong>${escaparHtml(pessoa.name)}</strong><br><span>@${escaparHtml(pessoa.username)}</span>`).join("")
        : "Nenhum usuário encontrado com esse nome de usuário.";
    } catch (erro) {
      resultado.textContent = "Não foi possível buscar usuários agora.";
    }
  });
}

document.getElementById("btn-sair").addEventListener("click", (evento) => {
  evento.stopPropagation();
  abrirModal("Sair da conta", `
    <p>Tem certeza que deseja sair? Você precisará entrar novamente para acessar sua biblioteca.</p>
    <div class="view-acoes">
      <button class="botao-secundario" id="cancelar-saida">Cancelar</button>
      <button class="botao-secundario botao-perigo" id="confirmar-saida">Sair da conta</button>
    </div>
  `);
  document.getElementById("cancelar-saida").addEventListener("click", fecharModal);
  document.getElementById("confirmar-saida").addEventListener("click", () => {
    localStorage.removeItem("appmusica_logado");
    window.location.href = "login.html";
  });
});

/* ===== Gêneros ===== */
btnGenero.addEventListener("click", () => mostrarView("view-genero"));

document.querySelectorAll(".tag-genero").forEach((tag) => {
  tag.addEventListener("click", () => {
    const genero = tag.dataset.genero;
    const resultado = catalogo.filter((m) => m.genero === genero);
    document.getElementById("genero-titulo-resultado").textContent = `Gênero: ${genero}`;
    renderizarLista(document.getElementById("genero-resultado-lista"), resultado, resultado, "Nenhuma música nesse gênero ainda.");
  });
});

/* ===== Busca: sugestões no campo, resultados completos com Enter ===== */
let viewAntesDaBusca = "view-inicio";

function atualizarSugestoesBusca() {
  const termo = campoBusca.value.trim();
  sugestoesBusca.innerHTML = "";
  if (!termo) {
    sugestoesBusca.classList.remove("aberto");
    return;
  }
  const resultados = buscarMusicas(termo).slice(0, 5);
  if (resultados.length === 0) {
    sugestoesBusca.innerHTML = `<div class="sugestao-vazia">Nenhum resultado encontrado</div>`;
  } else {
    resultados.forEach((musica) => {
      const sugestao = document.createElement("button");
      sugestao.className = "sugestao-busca-item";
      sugestao.innerHTML = `<span class="sugestao-capa">${escaparHtml(musica.titulo.charAt(0))}</span><span><strong>${escaparHtml(musica.titulo)}</strong><small>${escaparHtml(musica.artista)}</small></span>`;
      sugestao.addEventListener("click", () => {
        campoBusca.value = musica.titulo;
        abrirResultadosBusca();
      });
      sugestoesBusca.appendChild(sugestao);
    });
  }
  sugestoesBusca.classList.add("aberto");
}

function abrirResultadosBusca() {
  const termo = campoBusca.value.trim();
  sugestoesBusca.classList.remove("aberto");
  if (!termo) return;
  const viewAtual = document.querySelector(".view.ativa");
  if (viewAtual && viewAtual.id !== "view-busca") viewAntesDaBusca = viewAtual.id;
  const resultados = buscarMusicas(termo);
  renderizarLista(document.getElementById("busca-resultado-lista"), resultados, resultados, "Nada encontrado. Tente outro termo, ou pesquise por um trecho da letra.");
  mostrarView("view-busca");
}

campoBusca.addEventListener("input", atualizarSugestoesBusca);
campoBusca.addEventListener("keydown", (evento) => {
  if (evento.key === "Enter") {
    evento.preventDefault();
    abrirResultadosBusca();
  }
  if (evento.key === "Escape") sugestoesBusca.classList.remove("aberto");
});
document.addEventListener("click", (evento) => {
  if (!evento.target.closest(".busca")) sugestoesBusca.classList.remove("aberto");
});

document.querySelectorAll(".botao-layout").forEach((botao) => {
  botao.addEventListener("click", () => aplicarLayout(botao.dataset.layout));
});

/* =========================================================
   CENTRAL DO CRIADOR: upload de música (mock local)
========================================================= */
const formUpload = document.getElementById("form-upload-musica");
if (formUpload) {
  formUpload.addEventListener("submit", async (ev) => {
    ev.preventDefault();

    const titulo = document.getElementById("upload-titulo").value.trim();
    const artista = document.getElementById("upload-artista").value.trim();
    const genero = document.getElementById("upload-genero").value.trim() || "Sem gênero";
    const letra = document.getElementById("upload-letra").value.trim() || "Letra não informada pelo criador.";
    const capaInput = document.getElementById("upload-capa");
    const arquivoInput = document.getElementById("upload-arquivo");

    if (!titulo || !artista || !arquivoInput.files[0]) {
      abrirModal("Faltou algo", `<p>Preencha ao menos o título, o artista e selecione um arquivo de áudio.</p>`);
      return;
    }

    // Cria uma URL temporária pro arquivo local, só pra essa sessão do navegador
    // (isso NÃO é upload de verdade pra um servidor — isso é o que o backend vai fazer)
    const urlLocal = await arquivoComoDataUrl(arquivoInput.files[0]);

    const capaUrl = capaInput.files[0] ? await arquivoComoDataUrl(capaInput.files[0]) : "";
    const resposta = await fetch(`${API_BASE}/musicas`, { method: "POST", headers: { ...cabecalhoApi(), "Content-Type": "application/json" }, body: JSON.stringify({ title: titulo, artist: artista, fileUrl: urlLocal, coverUrl: capaUrl, genre: genero, lyrics: letra }) });
    if (!resposta.ok) {
      abrirModal("Upload não realizado", "<p>Faça login antes de enviar uma música.</p>");
      return;
    }
    const criada = await resposta.json();
    catalogo.push({ id: criada.id, titulo, artista, arquivo: urlLocal, genero, letra, capaUrl, curtida: false, ownerUsername: criada.ownerUsername });

    salvarEstado();
    rerenderizarTudo();
    formUpload.reset();
    abrirModal("Música adicionada", `<p><strong>${titulo}</strong> foi adicionada ao catálogo e já aparece em "Descubra mais".</p>`);
  });
}

/* ===== Perfil e álbum: dados locais da conta ===== */
const perfilSalvo = JSON.parse(localStorage.getItem("appmusica_perfil") || "{}");
const perfilCampos = {
  nome: document.getElementById("perfil-nome"),
  username: document.getElementById("perfil-username"),
  bio: document.getElementById("perfil-bio"),
  genero: document.getElementById("perfil-genero"),
  pronomes: document.getElementById("perfil-pronomes"),
  aniversario: document.getElementById("perfil-aniversario"),
};

perfilCampos.username.value = localStorage.getItem("appmusica_username") || "";

const menuGenero = document.getElementById("menu-genero");
const menuAniversario = document.getElementById("menu-aniversario");
const generoBotao = menuGenero.querySelector(".campo-select-botao");
const aniversarioBotao = menuAniversario.querySelector(".campo-select-botao");
const calendario = menuAniversario.querySelector(".calendario-custom");
let calendarioData = new Date();

function fecharMenusCustom(excecao) {
  document.querySelectorAll(".campo-menu-custom.aberto").forEach((menu) => {
    if (menu !== excecao) {
      menu.classList.remove("aberto");
      menu.querySelector(".campo-select-botao").setAttribute("aria-expanded", "false");
    }
  });
}

generoBotao.addEventListener("click", (evento) => {
  evento.stopPropagation();
  const aberto = menuGenero.classList.contains("aberto");
  fecharMenusCustom(menuGenero);
  menuGenero.classList.toggle("aberto", !aberto);
  generoBotao.setAttribute("aria-expanded", String(!aberto));
});

menuGenero.querySelectorAll("[data-valor]").forEach((opcao) => {
  opcao.addEventListener("click", () => {
    perfilCampos.genero.value = opcao.dataset.valor;
    generoBotao.firstChild.textContent = `${opcao.dataset.valor} `;
    fecharMenusCustom();
  });
});

function formatarData(data) {
  return data.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function renderizarCalendario() {
  const ano = calendarioData.getFullYear();
  const mes = calendarioData.getMonth();
  const primeiroDia = new Date(ano, mes, 1).getDay();
  const diasNoMes = new Date(ano, mes + 1, 0).getDate();
  const nomesMeses = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  const dias = Array.from({ length: primeiroDia }, () => "<span></span>").join("");
  const botoes = Array.from({ length: diasNoMes }, (_, indice) => {
    const dia = indice + 1;
    const valor = `${ano}-${String(mes + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
    return `<button type="button" data-data="${valor}">${dia}</button>`;
  }).join("");
  calendario.innerHTML = `
    <div class="calendario-cabecalho"><button type="button" data-mes="-1">‹</button><strong>${nomesMeses[mes]} ${ano}</strong><button type="button" data-mes="1">›</button></div>
    <div class="calendario-semana"><span>D</span><span>S</span><span>T</span><span>Q</span><span>Q</span><span>S</span><span>S</span></div>
    <div class="calendario-dias">${dias}${botoes}</div>
  `;
  calendario.querySelectorAll("[data-mes]").forEach((botao) => botao.addEventListener("click", () => {
    calendarioData.setMonth(calendarioData.getMonth() + Number(botao.dataset.mes));
    renderizarCalendario();
  }));
  calendario.querySelectorAll("[data-data]").forEach((botao) => botao.addEventListener("click", () => {
    perfilCampos.aniversario.value = botao.dataset.data;
    aniversarioBotao.firstChild.textContent = `${formatarData(new Date(`${botao.dataset.data}T12:00:00`))} `;
    fecharMenusCustom();
  }));
  requestAnimationFrame(() => {
    const area = calendario.getBoundingClientRect();
    menuAniversario.classList.toggle("abre-para-cima", area.bottom > window.innerHeight - 16);
  });
}

aniversarioBotao.addEventListener("click", (evento) => {
  evento.stopPropagation();
  const aberto = menuAniversario.classList.contains("aberto");
  fecharMenusCustom(menuAniversario);
  menuAniversario.classList.toggle("aberto", !aberto);
  aniversarioBotao.setAttribute("aria-expanded", String(!aberto));
  if (!aberto) renderizarCalendario();
});
document.addEventListener("click", () => fecharMenusCustom());

Object.entries(perfilCampos).forEach(([chave, campo]) => {
  if (campo && perfilSalvo[chave]) campo.value = perfilSalvo[chave];
});
if (perfilSalvo.genero) generoBotao.firstChild.textContent = `${perfilSalvo.genero} `;
if (perfilSalvo.aniversario) aniversarioBotao.firstChild.textContent = `${formatarData(new Date(`${perfilSalvo.aniversario}T12:00:00`))} `;
if (perfilSalvo.foto) {
  document.getElementById("preview-foto-perfil").style.backgroundImage = `url("${perfilSalvo.foto}")`;
  document.getElementById("preview-foto-perfil").classList.add("com-imagem");
  avatar.style.backgroundImage = `url("${perfilSalvo.foto}")`;
}

document.getElementById("input-foto-perfil").addEventListener("change", async (evento) => {
  const arquivo = evento.target.files[0];
  if (!arquivo) return;
  const imagem = await arquivoComoDataUrl(arquivo);
  document.getElementById("preview-foto-perfil").style.backgroundImage = `url("${imagem}")`;
  document.getElementById("preview-foto-perfil").classList.add("com-imagem");
  document.getElementById("preview-foto-perfil").dataset.fotoPendente = imagem;
});

document.getElementById("salvar-perfil").addEventListener("click", () => {
  Object.entries(perfilCampos).forEach(([chave, campo]) => { perfilSalvo[chave] = campo.value.trim(); });
  const fotoPendente = document.getElementById("preview-foto-perfil").dataset.fotoPendente;
  if (fotoPendente) {
    perfilSalvo.foto = fotoPendente;
    avatar.style.backgroundImage = `url("${fotoPendente}")`;
  }
  localStorage.setItem("appmusica_perfil", JSON.stringify(perfilSalvo));
  abrirModal("Perfil atualizado", "<p>Suas informações foram salvas neste dispositivo.</p>");
});

document.getElementById("album-capa").addEventListener("change", async (evento) => {
  const arquivo = evento.target.files[0];
  if (!arquivo) return;
  const imagem = await arquivoComoDataUrl(arquivo);
  const preview = document.getElementById("preview-capa-album");
  preview.style.backgroundImage = `url("${imagem}")`;
  preview.classList.add("com-imagem");
  localStorage.setItem("appmusica_album_capa", imagem);
});

document.getElementById("criar-album").addEventListener("click", () => {
  const nome = document.getElementById("album-nome").value.trim();
  if (!nome) {
    abrirModal("Faltou o nome", "<p>Digite um nome para o álbum antes de continuar.</p>");
    return;
  }
  localStorage.setItem("appmusica_album_nome", nome);
  abrirModal("Álbum criado", `<p><strong>${nome}</strong> foi salvo neste dispositivo.</p>`);
});

const albumSalvo = localStorage.getItem("appmusica_album_capa");
if (albumSalvo) {
  document.getElementById("preview-capa-album").style.backgroundImage = `url("${albumSalvo}")`;
  document.getElementById("preview-capa-album").classList.add("com-imagem");
}
const albumNomeSalvo = localStorage.getItem("appmusica_album_nome");
if (albumNomeSalvo) document.getElementById("album-nome").value = albumNomeSalvo;

/* =========================================================
   RENDERIZAÇÃO GERAL
========================================================= */
function rerenderizarTudo() {
  renderizarCardsDescubra();
  renderizarSidebar();
}

aplicarTema();
aplicarLayout(layoutAtual);
