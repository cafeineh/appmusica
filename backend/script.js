/* =========================================================
   Este arquivo agora fala com um backend de verdade.
   Rode "cd backend && mvn spring-boot:run" antes de abrir esta página,
   ou as chamadas de rede abaixo vão falhar.
========================================================= */
const API_BASE = "http://localhost:8080/api";
const SERVIDOR_BASE = "http://localhost:8080"; // usado para montar a URL completa dos áudios/capas

const token = localStorage.getItem("appmusica_token");
if (!token) {
  window.location.href = "login.html";
}

// Header padrão pra toda chamada autenticada
function cabecalhosAuth(extras = {}) {
  return { Authorization: `Bearer ${token}`, ...extras };
}

// Envolve fetch com tratamento básico de erro de rede/servidor fora do ar
async function chamarApi(caminho, opcoes = {}) {
  const resposta = await fetch(`${API_BASE}${caminho}`, opcoes);
  if (resposta.status === 401) {
    // Token inválido/expirado: manda de volta pro login
    localStorage.removeItem("appmusica_token");
    window.location.href = "login.html";
    throw new Error("Não autenticado");
  }
  if (!resposta.ok) {
    const corpo = await resposta.json().catch(() => ({}));
    throw new Error(corpo.mensagem || corpo.erro || `Erro ${resposta.status}`);
  }
  return resposta.status === 204 ? null : resposta.json();
}

function urlCompleta(caminhoRelativo) {
  if (!caminhoRelativo) return "";
  return caminhoRelativo.startsWith("http") ? caminhoRelativo : SERVIDOR_BASE + caminhoRelativo;
}

/* =========================================================
   ESTADO EM MEMÓRIA (carregado da API ao abrir a página)
========================================================= */
let catalogo = [];       // todas as músicas
let curtidasIds = new Set();
let playlists = [];      // [{id, nome}]
let idsEmPlaylist = new Set(); // músicas que já estão em ALGUMA playlist

async function carregarTudoDaApi() {
  const [musicas, curtidas, minhasPlaylists] = await Promise.all([
    chamarApi("/musicas", { headers: cabecalhosAuth() }),
    chamarApi("/musicas/curtidas", { headers: cabecalhosAuth() }),
    chamarApi("/playlists", { headers: cabecalhosAuth() }),
  ]);

  catalogo = musicas;
  curtidasIds = new Set(curtidas.map((m) => m.id));
  playlists = minhasPlaylists;

  // Pra saber quais músicas já estão em alguma playlist, buscamos as
  // músicas de cada playlist do usuário (em paralelo)
  const listasDeMusicas = await Promise.all(
    playlists.map((p) => chamarApi(`/playlists/${p.id}/musicas`, { headers: cabecalhosAuth() }))
  );
  idsEmPlaylist = new Set(listasDeMusicas.flat().map((m) => m.id));
}

/* =========================================================
   BUSCA APROXIMADA (chama o endpoint /musicas/buscar do backend,
   que já faz a mesma lógica de tolerância a erro de digitação
   que fizemos em JS antes — agora em Java, do lado do servidor)
========================================================= */
async function buscarMusicas(consulta) {
  if (!consulta.trim()) return [];
  return chamarApi(`/musicas/buscar?q=${encodeURIComponent(consulta)}`, { headers: cabecalhosAuth() });
}

/* =========================================================
   ELEMENTOS DA PÁGINA
========================================================= */
const player = document.getElementById("player");
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

const modalFundo = document.getElementById("modal-fundo");
const modalTitulo = document.getElementById("modal-titulo");
const modalCorpo = document.getElementById("modal-corpo");
const modalFechar = document.getElementById("modal-fechar");

let embaralharAtivo = false;
let modoRepeticao = "off"; // "off" | "todas" | "uma"
let filaAtual = [];
let indiceAtual = -1;

/* =========================================================
   RENDERIZAÇÃO DE UMA LINHA DE MÚSICA
========================================================= */
function criarLinhaMusica(musica, fila) {
  const li = document.createElement("li");
  li.className = "tracklist-item";
  li.dataset.id = musica.id;

  const inicial = musica.titulo.charAt(0).toUpperCase();
  const curtida = curtidasIds.has(musica.id);
  const capa = urlCompleta(musica.capaUrl);

  li.innerHTML = `
    <span class="faixa-capa" ${capa ? `style="background-image:url('${capa}')"` : ""}>
      ${capa ? "" : inicial}
    </span>
    <span class="faixa-info">
      <span class="faixa-titulo">${musica.titulo}</span>
      <span class="faixa-artista">${musica.artista}</span>
    </span>
    <button class="faixa-curtir ${curtida ? "curtido" : ""}" title="Curtir" aria-label="Curtir">
      <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor"><path d="M10 17s-6.5-4-6.5-8.7A3.8 3.8 0 0 1 10 6a3.8 3.8 0 0 1 6.5 2.3C16.5 13 10 17 10 17Z"/></svg>
    </button>
    <button class="faixa-add" title="Adicionar à playlist" aria-label="Adicionar à playlist">
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M8 3v10M3 8h10" stroke-linecap="round"/></svg>
    </button>
  `;

  li.addEventListener("click", () => {
    tocarNaFila(fila, fila.findIndex((m) => m.id === musica.id));
  });

  li.querySelector(".faixa-curtir").addEventListener("click", async (ev) => {
    ev.stopPropagation();
    await alternarCurtida(musica.id);
  });

  li.querySelector(".faixa-add").addEventListener("click", (ev) => {
    ev.stopPropagation();
    abrirModalAdicionarPlaylist(musica);
  });

  if (indiceAtual !== -1 && filaAtual[indiceAtual] && filaAtual[indiceAtual].id === musica.id) {
    li.classList.add("ativa");
  }

  return li;
}

function renderizarLista(container, musicas, fila, mensagemVazio) {
  container.innerHTML = "";
  if (musicas.length === 0) {
    const vazio = document.createElement("p");
    vazio.className = "estado-vazio";
    vazio.textContent = mensagemVazio || "Nada por aqui ainda.";
    container.appendChild(vazio);
    return;
  }
  musicas.forEach((m) => container.appendChild(criarLinhaMusica(m, fila)));
}

/* =========================================================
   CURTIR (agora via API — o backend guarda isso no banco)
========================================================= */
async function alternarCurtida(musicaId) {
  const resultado = await chamarApi(`/musicas/${musicaId}/curtir`, {
    method: "POST",
    headers: cabecalhosAuth(),
  });

  if (resultado.curtida) curtidasIds.add(musicaId);
  else curtidasIds.delete(musicaId);

  if (indiceAtual !== -1 && filaAtual[indiceAtual] && filaAtual[indiceAtual].id === musicaId) {
    btnCurtir.classList.toggle("curtido", resultado.curtida);
  }

  await rerenderizarTudo();
}

/* =========================================================
   TOCAR MÚSICA
========================================================= */
function tocarNaFila(fila, indice) {
  if (indice < 0 || indice >= fila.length) return;

  filaAtual = fila;
  indiceAtual = indice;
  const musica = fila[indice];

  player.src = urlCompleta(musica.arquivoUrl);
  player.play();

  tocandoAgoraEl.textContent = musica.titulo;
  tocandoAutorEl.textContent = musica.artista;
  btnCurtir.classList.toggle("curtido", curtidasIds.has(musica.id));

  document.querySelectorAll(".tracklist-item").forEach((li) => {
    li.classList.toggle("ativa", Number(li.dataset.id) === musica.id);
  });
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
  if (embaralharAtivo) tocarIndiceAleatorio();
  else tocarNaFila(filaAtual, indiceAtual - 1);
});

btnProximo.addEventListener("click", () => {
  if (embaralharAtivo) tocarIndiceAleatorio();
  else tocarNaFila(filaAtual, indiceAtual + 1);
});

function tocarIndiceAleatorio() {
  if (filaAtual.length <= 1) { tocarNaFila(filaAtual, 0); return; }
  let proximo = indiceAtual;
  while (proximo === indiceAtual) {
    proximo = Math.floor(Math.random() * filaAtual.length);
  }
  tocarNaFila(filaAtual, proximo);
}

player.addEventListener("play", () => {
  iconePlay.style.display = "none";
  iconePause.style.display = "block";
});

player.addEventListener("pause", () => {
  iconePlay.style.display = "block";
  iconePause.style.display = "none";
});

player.addEventListener("ended", () => {
  if (modoRepeticao === "uma") { tocarNaFila(filaAtual, indiceAtual); return; }
  if (embaralharAtivo) { tocarIndiceAleatorio(); return; }
  const proximo = indiceAtual + 1;
  if (proximo < filaAtual.length) tocarNaFila(filaAtual, proximo);
  else if (modoRepeticao === "todas") tocarNaFila(filaAtual, 0);
});

btnCurtir.addEventListener("click", async () => {
  if (indiceAtual === -1) return;
  await alternarCurtida(filaAtual[indiceAtual].id);
});

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
    const item = criarItemBiblioteca(playlist.nome, async () => {
      return chamarApi(`/playlists/${playlist.id}/musicas`, { headers: cabecalhosAuth() });
    });
    listaPlaylistsEl.appendChild(item);
  });
}

function criarItemBiblioteca(nome, obterFaixas) {
  const wrap = document.createElement("div");
  wrap.className = "biblioteca-bloco";

  const botao = document.createElement("button");
  botao.className = "biblioteca-item";
  botao.innerHTML = `
    <span class="biblioteca-item-capa">${nome.charAt(0).toUpperCase()}</span>
    <span class="biblioteca-item-nome">${nome}</span>
  `;

  const sublista = document.createElement("ol");
  sublista.className = "biblioteca-sublista";

  botao.addEventListener("click", async () => {
    const aberta = sublista.classList.contains("aberta");
    document.querySelectorAll(".biblioteca-sublista.aberta").forEach((el) => el.classList.remove("aberta"));
    if (!aberta) {
      const faixas = await obterFaixas();
      renderizarLista(sublista, faixas, faixas, "Nenhuma música aqui ainda.");
      sublista.classList.add("aberta");
    }
  });

  wrap.appendChild(botao);
  wrap.appendChild(sublista);
  return wrap;
}

const btnCurtidas = document.getElementById("btn-curtidas");
const sublistaCurtidas = document.getElementById("sublista-curtidas");
btnCurtidas.addEventListener("click", async () => {
  const aberta = sublistaCurtidas.classList.contains("aberta");
  document.querySelectorAll(".biblioteca-sublista.aberta").forEach((el) => el.classList.remove("aberta"));
  if (!aberta) {
    const curtidas = await chamarApi("/musicas/curtidas", { headers: cabecalhosAuth() });
    renderizarLista(sublistaCurtidas, curtidas, curtidas, "Você ainda não curtiu nenhuma música.");
    sublistaCurtidas.classList.add("aberta");
  }
});

btnNovaPlaylist.addEventListener("click", () => {
  abrirModal("Nova playlist", `
    <label class="campo-label">Nome da playlist</label>
    <input type="text" id="input-nome-playlist" class="campo-texto" placeholder="Ex: Pra treinar" />
    <button class="botao-primario" id="confirmar-nova-playlist">Criar</button>
  `);

  document.getElementById("confirmar-nova-playlist").addEventListener("click", async () => {
    const nome = document.getElementById("input-nome-playlist").value.trim();
    if (!nome) return;
    await chamarApi("/playlists", {
      method: "POST",
      headers: cabecalhosAuth({ "Content-Type": "application/json" }),
      body: JSON.stringify({ nome }),
    });
    await carregarTudoDaApi();
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
    .map((p) => `<button class="opcao-playlist" data-id="${p.id}">${p.nome}</button>`)
    .join("");

  abrirModal("Adicionar à playlist", `<div class="lista-opcoes-playlist">${opcoes}</div>`);

  modalCorpo.querySelectorAll(".opcao-playlist").forEach((botao) => {
    botao.addEventListener("click", async () => {
      const playlistId = botao.dataset.id;
      await chamarApi(`/playlists/${playlistId}/musicas/${musica.id}`, {
        method: "POST",
        headers: cabecalhosAuth(),
      });
      await carregarTudoDaApi();
      await rerenderizarTudo();
      fecharModal();
    });
  });
}

/* =========================================================
   MODAL GENÉRICO
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
   POPOVERS
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
========================================================= */
function mostrarView(id) {
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("ativa"));
  document.getElementById(id).classList.add("ativa");
  fecharPopoversMenos(null);
}

btnHome.addEventListener("click", () => mostrarView("view-inicio"));
btnPremium.addEventListener("click", () => mostrarView("view-premium"));

document.querySelectorAll("[data-ir-para]").forEach((el) => {
  el.addEventListener("click", () => mostrarView(el.dataset.irPara));
});

document.getElementById("btn-sair").addEventListener("click", () => {
  localStorage.removeItem("appmusica_token");
  localStorage.removeItem("appmusica_nome");
  localStorage.removeItem("appmusica_email");
  window.location.href = "login.html";
});

/* ===== Gêneros (filtra o catálogo já carregado, sem nova chamada) ===== */
btnGenero.addEventListener("click", () => mostrarView("view-genero"));

document.querySelectorAll(".tag-genero").forEach((tag) => {
  tag.addEventListener("click", () => {
    const genero = tag.dataset.genero;
    const resultado = catalogo.filter((m) => m.genero === genero);
    document.getElementById("genero-titulo-resultado").textContent = `Gênero: ${genero}`;
    renderizarLista(document.getElementById("genero-resultado-lista"), resultado, resultado, "Nenhuma música nesse gênero ainda.");
  });
});

/* ===== Busca (agora via API, com busca aproximada feita no backend) ===== */
let viewAntesDaBusca = "view-inicio";

campoBusca.addEventListener("input", async () => {
  const termo = campoBusca.value;

  if (!termo.trim()) {
    mostrarView(viewAntesDaBusca);
    return;
  }

  const viewAtual = document.querySelector(".view.ativa");
  if (viewAtual && viewAtual.id !== "view-busca") {
    viewAntesDaBusca = viewAtual.id;
  }

  const resultados = await buscarMusicas(termo);
  renderizarLista(
    document.getElementById("busca-resultado-lista"),
    resultados,
    resultados,
    "Nada encontrado. Tente outro termo, ou pesquise por um trecho da letra."
  );
  mostrarView("view-busca");
});

/* =========================================================
   CENTRAL DO CRIADOR: upload de música (agora envia de verdade
   pro backend via multipart/form-data)
========================================================= */
const formUpload = document.getElementById("form-upload-musica");
if (formUpload) {
  formUpload.addEventListener("submit", async (ev) => {
    ev.preventDefault();

    const titulo = document.getElementById("upload-titulo").value.trim();
    const artista = document.getElementById("upload-artista").value.trim();
    const genero = document.getElementById("upload-genero").value.trim();
    const letra = document.getElementById("upload-letra").value.trim();
    const arquivoInput = document.getElementById("upload-arquivo");
    const capaInput = document.querySelector('input[type="file"][accept="image/*"]');

    if (!titulo || !artista || !arquivoInput.files[0]) {
      abrirModal("Faltou algo", `<p>Preencha ao menos o título, o artista e selecione um arquivo de áudio.</p>`);
      return;
    }

    const formData = new FormData();
    formData.append("titulo", titulo);
    formData.append("artista", artista);
    if (genero) formData.append("genero", genero);
    if (letra) formData.append("letra", letra);
    formData.append("arquivo", arquivoInput.files[0]);
    if (capaInput && capaInput.files[0]) formData.append("capa", capaInput.files[0]);

    const botao = formUpload.querySelector(".botao-primario");
    botao.disabled = true;
    botao.textContent = "Enviando...";

    try {
      // Não definimos "Content-Type" manualmente aqui — o navegador define
      // sozinho o boundary correto do multipart/form-data ao usar FormData.
      await chamarApi("/musicas", {
        method: "POST",
        headers: cabecalhosAuth(),
        body: formData,
      });

      await carregarTudoDaApi();
      await rerenderizarTudo();
      formUpload.reset();
      abrirModal("Música adicionada", `<p><strong>${titulo}</strong> foi enviada para o servidor e já aparece em "Descubra mais".</p>`);
    } catch (erro) {
      abrirModal("Erro no envio", `<p>${erro.message}</p>`);
    } finally {
      botao.disabled = false;
      botao.textContent = "Publicar música";
    }
  });
}

/* =========================================================
   RENDERIZAÇÃO GERAL
========================================================= */
async function rerenderizarTudo() {
  const semOrganizar = catalogo.filter((m) => !curtidasIds.has(m.id) && !idsEmPlaylist.has(m.id));

  renderizarLista(
    document.getElementById("lista-descubra"),
    semOrganizar,
    semOrganizar,
    "Todas as músicas já estão organizadas em playlists ou curtidas!"
  );

  renderizarSidebar();
}

/* =========================================================
   INICIALIZAÇÃO
========================================================= */
(async function iniciar() {
  try {
    await carregarTudoDaApi();
    await rerenderizarTudo();
  } catch (erro) {
    document.getElementById("lista-descubra").innerHTML =
      `<p class="estado-vazio">Não foi possível carregar os dados. Verifique se o backend está rodando em http://localhost:8080 (cd backend && mvn spring-boot:run).</p>`;
    console.error(erro);
  }
})();
