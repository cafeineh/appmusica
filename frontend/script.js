const player = document.getElementById("player");
const musicas = Array.from(document.querySelectorAll("#lista-musicas li"));
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

// Novos elementos: sidebar, popovers, controles extras
const biblioteca = document.getElementById("biblioteca");
const btnExpandir = document.getElementById("btn-expandir");
const btnNovaPlaylist = document.getElementById("btn-nova-playlist");

const btnNotificacoes = document.getElementById("btn-notificacoes");
const popoverNotificacoes = document.getElementById("popover-notificacoes");
const btnMensagens = document.getElementById("btn-mensagens");
const popoverMensagens = document.getElementById("popover-mensagens");

const btnCurtir = document.getElementById("btn-curtir");
const btnEmbaralhar = document.getElementById("btn-embaralhar");
const btnRepetir = document.getElementById("btn-repetir");
const btnVolume = document.getElementById("btn-volume");

let embaralharAtivo = false;
// Modos de repetição: "off" -> "todas" -> "uma" -> volta pro "off"
let modoRepeticao = "off";

let indiceAtual = -1; // nenhuma música tocando ainda

// ===== Tocar uma faixa pelo índice na lista =====
function tocarFaixa(indice) {
  if (indice < 0 || indice >= musicas.length) return;

  indiceAtual = indice;
  const item = musicas[indice];

  player.src = item.dataset.arquivo;
  player.play();

  const titulo = item.querySelector(".faixa-titulo").textContent;
  const artista = item.querySelector(".faixa-artista").textContent;
  tocandoAgoraEl.textContent = titulo;
  tocandoAutorEl.textContent = artista;

  musicas.forEach((li) => li.classList.remove("ativa"));
  item.classList.add("ativa");
}

// Clique em qualquer música da lista
musicas.forEach((item, indice) => {
  item.addEventListener("click", () => tocarFaixa(indice));
});

// ===== Botão play/pause =====
btnPlay.addEventListener("click", () => {
  if (indiceAtual === -1) {
    tocarFaixa(0); // se nada foi clicado ainda, começa pela primeira
    return;
  }
  if (player.paused) {
    player.play();
  } else {
    player.pause();
  }
});

// ===== Anterior / Próximo =====
btnAnterior.addEventListener("click", () => tocarFaixa(indiceAtual - 1));
btnProximo.addEventListener("click", () => tocarFaixa(indiceAtual + 1));

// ===== Sincronizar ícone de play/pause com o estado real do áudio =====
player.addEventListener("play", () => {
  iconePlay.style.display = "none";
  iconePause.style.display = "block";
});

player.addEventListener("pause", () => {
  iconePlay.style.display = "block";
  iconePause.style.display = "none";
});

// Quando uma música termina, decide a próxima com base em embaralhar/repetir
player.addEventListener("ended", () => {
  if (modoRepeticao === "uma") {
    tocarFaixa(indiceAtual); // repete a mesma
    return;
  }

  if (embaralharAtivo) {
    // Escolhe um índice aleatório diferente do atual (se houver mais de 1 música)
    let proximo = indiceAtual;
    if (musicas.length > 1) {
      while (proximo === indiceAtual) {
        proximo = Math.floor(Math.random() * musicas.length);
      }
    }
    tocarFaixa(proximo);
    return;
  }

  const proximoIndice = indiceAtual + 1;
  if (proximoIndice < musicas.length) {
    tocarFaixa(proximoIndice);
  } else if (modoRepeticao === "todas") {
    tocarFaixa(0); // volta pro início da lista
  }
  // se modoRepeticao === "off" e acabou a lista, simplesmente para
});

// ===== Barra de progresso =====
function formatarTempo(segundos) {
  if (isNaN(segundos)) return "0:00";
  const min = Math.floor(segundos / 60);
  const seg = Math.floor(segundos % 60).toString().padStart(2, "0");
  return `${min}:${seg}`;
}

// Atualiza a barra e o tempo enquanto a música toca
player.addEventListener("timeupdate", () => {
  if (!player.duration) return;
  barraProgresso.value = (player.currentTime / player.duration) * 100;
  tempoAtualEl.textContent = formatarTempo(player.currentTime);
});

// Quando os metadados carregam, já sabemos a duração total
player.addEventListener("loadedmetadata", () => {
  tempoTotalEl.textContent = formatarTempo(player.duration);
});

// Permite arrastar a barra para pular pra qualquer ponto da música
barraProgresso.addEventListener("input", () => {
  if (!player.duration) return;
  player.currentTime = (barraProgresso.value / 100) * player.duration;
});

// ===== Sidebar: expandir/encolher =====
btnExpandir.addEventListener("click", () => {
  biblioteca.classList.toggle("expandida");
});

// ===== Criar nova playlist (por enquanto, só o botão reagindo) =====
btnNovaPlaylist.addEventListener("click", () => {
  // Aqui é o ponto onde, no futuro, isso vai abrir um formulário
  // ou chamar o backend pra criar a playlist de verdade.
  btnNovaPlaylist.classList.add("clicado");
  setTimeout(() => btnNovaPlaylist.classList.remove("clicado"), 400);
  console.log("Criar nova playlist: em breve isso vai abrir um formulário / chamar o backend.");
});

// ===== Popovers de notificação e mensagens =====
// Função genérica: alterna um popover e fecha o outro, se estiver aberto
function alternarPopover(popoverParaAbrir, outroPopover) {
  const estavaAberto = popoverParaAbrir.classList.contains("aberto");
  popoverNotificacoes.classList.remove("aberto");
  popoverMensagens.classList.remove("aberto");
  if (!estavaAberto) {
    popoverParaAbrir.classList.add("aberto");
  }
}

btnNotificacoes.addEventListener("click", (evento) => {
  evento.stopPropagation();
  alternarPopover(popoverNotificacoes, popoverMensagens);
});

btnMensagens.addEventListener("click", (evento) => {
  evento.stopPropagation();
  alternarPopover(popoverMensagens, popoverNotificacoes);
});

// Clicar em qualquer outro lugar da página fecha os popovers abertos
document.addEventListener("click", () => {
  popoverNotificacoes.classList.remove("aberto");
  popoverMensagens.classList.remove("aberto");
});

// ===== Curtir música atual =====
btnCurtir.addEventListener("click", () => {
  btnCurtir.classList.toggle("curtido");
});

// ===== Embaralhar =====
btnEmbaralhar.addEventListener("click", () => {
  embaralharAtivo = !embaralharAtivo;
  btnEmbaralhar.classList.toggle("ativo", embaralharAtivo);
});

// ===== Repetir (três estados: off -> todas -> uma -> off) =====
btnRepetir.addEventListener("click", () => {
  if (modoRepeticao === "off") {
    modoRepeticao = "todas";
  } else if (modoRepeticao === "todas") {
    modoRepeticao = "uma";
  } else {
    modoRepeticao = "off";
  }

  btnRepetir.classList.toggle("ativo", modoRepeticao !== "off");
  if (modoRepeticao === "uma") {
    btnRepetir.setAttribute("data-modo", "uma");
  } else {
    btnRepetir.removeAttribute("data-modo");
  }
});

// ===== Volume (clique alterna mudo/com som) =====
btnVolume.addEventListener("click", () => {
  player.muted = !player.muted;
  btnVolume.classList.toggle("ativo", player.muted);
});
