package com.appmusica;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;
import java.util.concurrent.atomic.AtomicLong;

@RestController
@RequestMapping("/api")
public class ApiController {
    private final Map<String, User> users = new HashMap<>();
    private final Map<Long, Music> music = new LinkedHashMap<>();
    private final Map<Long, Playlist> playlists = new LinkedHashMap<>();
    private final Map<String, Set<Long>> likes = new HashMap<>();
    private final AtomicLong playlistIds = new AtomicLong(1);
    private final AtomicLong musicIds = new AtomicLong(3);
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final Path dataFile = Path.of("appmusica-data.json");
    private final JwtService jwtService;
    private final PasswordEncoder passwordEncoder;

    public ApiController(JwtService jwtService, PasswordEncoder passwordEncoder) {
        this.jwtService = jwtService;
        this.passwordEncoder = passwordEncoder;
        carregarDados();
        if (music.isEmpty()) {
            music.put(1L, new Music(1L, "Aurora", "App Música", null, null, null, null, null));
            music.put(2L, new Music(2L, "Horizonte", "App Música", null, null, null, null, null));
            salvarDados();
        }
    }

    @PostMapping("/auth/registrar")
    public ResponseEntity<?> register(@RequestBody Credentials credentials) {
        if (credentials == null || blank(credentials.email()) || blank(credentials.senha()) || blank(credentials.nome()) || blank(credentials.username())) {
            return ResponseEntity.badRequest().body(Map.of("erro", "Preencha todos os campos."));
        }
        String email = credentials.email().trim().toLowerCase();
        if (users.containsKey(email)) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("erro", "Este e-mail já está cadastrado."));
        }
        String username = credentials.username().trim().toLowerCase();
        if (username.isBlank() || !username.matches("[a-z0-9._-]{3,30}")) {
            return ResponseEntity.badRequest().body(Map.of("erro", "O nome de usuário deve ter 3 a 30 caracteres: letras, números, ponto, hífen ou sublinhado."));
        }
        if (users.values().stream().anyMatch(item -> item.username().equals(username))) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("erro", "Este nome de usuário já está em uso."));
        }
        if (credentials.senha().length() < 8 || credentials.senha().length() > 200) {
            return ResponseEntity.badRequest().body(Map.of("erro", "A senha deve ter entre 8 e 200 caracteres."));
        }
        User user = new User(username, credentials.nome().trim(), email, passwordEncoder.encode(credentials.senha()));
        users.put(email, user);
        salvarDados();
        return ResponseEntity.ok(session(user));
    }

    @PostMapping("/auth/login")
    public ResponseEntity<?> login(@RequestBody Credentials credentials) {
        if (credentials == null || blank(credentials.email()) || blank(credentials.senha())) {
            return ResponseEntity.badRequest().body(Map.of("erro", "Dados inválidos."));
        }
        User user = users.get(credentials.email().trim().toLowerCase());
        if (user == null || !senhaValida(user, credentials.senha())) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("erro", "E-mail ou senha incorretos."));
        }
        if (!user.password().startsWith("$2a$") && !user.password().startsWith("$2b$") && !user.password().startsWith("$2y$")) {
            users.put(user.email(), new User(user.username(), user.name(), user.email(), passwordEncoder.encode(credentials.senha())));
            salvarDados();
        }
        return ResponseEntity.ok(session(user));
    }

    @GetMapping("/musicas")
    public Collection<Music> allMusic() {
        return music.values();
    }

    @GetMapping("/usuarios/buscar")
    public Collection<UserSummary> searchUsers(@RequestParam String username) {
        String query = username.trim().toLowerCase();
        return users.values().stream()
            .filter(user -> user.username().equals(query))
            .map(user -> new UserSummary(user.username(), user.name()))
            .toList();
    }

    @PostMapping("/musicas")
    public ResponseEntity<?> createMusic(@RequestBody MusicRequest request,
                                         @RequestHeader(value = "Authorization", required = false) String authorization) {
        User owner = authenticatedUser(authorization);
        if (owner == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("erro", "Faça login para enviar músicas."));
        if (!validarMusica(request)) {
            return ResponseEntity.badRequest().body(Map.of("erro", "Título, artista e arquivo são obrigatórios."));
        }
        Music created = new Music(musicIds.getAndIncrement(), request.title().trim(), request.artist().trim(),
            request.coverUrl(), request.fileUrl(), request.genre(), request.lyrics(), owner.username());
        music.put(created.id(), created);
        salvarDados();
        return ResponseEntity.ok(created);
    }

    @PutMapping("/musicas/{id}")
    public ResponseEntity<?> updateMusic(@PathVariable long id, @RequestBody MusicRequest request,
                                         @RequestHeader(value = "Authorization", required = false) String authorization) {
        Music current = music.get(id);
        if (current == null) return ResponseEntity.notFound().build();
        if (!isOwner(current, authorization)) return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("erro", "Somente quem enviou a música pode alterá-la."));
        if (!validarMusica(request)) return ResponseEntity.badRequest().body(Map.of("erro", "Dados da música inválidos ou arquivo muito grande."));
        Music updated = new Music(id, request.title().trim(), request.artist().trim(), request.coverUrl(), request.fileUrl(), request.genre(), request.lyrics(), current.ownerUsername());
        music.put(id, updated);
        salvarDados();
        return ResponseEntity.ok(updated);
    }

    @DeleteMapping("/musicas/{id}")
    public ResponseEntity<?> deleteMusic(@PathVariable long id,
                                         @RequestHeader(value = "Authorization", required = false) String authorization) {
        Music current = music.get(id);
        if (current == null) return ResponseEntity.notFound().build();
        if (!isOwner(current, authorization)) return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("erro", "Somente quem enviou a música pode excluí-la."));
        music.remove(id);
        salvarDados();
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/musicas/buscar")
    public Collection<Music> search(@RequestParam(defaultValue = "") String q) {
        String query = q.toLowerCase();
        return music.values().stream()
            .filter(item -> item.title().toLowerCase().contains(query) || item.artist().toLowerCase().contains(query))
            .toList();
    }

    @GetMapping("/musicas/curtidas")
    public Collection<Music> liked(@RequestHeader(value = "Authorization", required = false) String authorization) {
        User user = authenticatedUser(authorization);
        return user == null ? List.of() : musicForIds(likesFor(user.email()));
    }

    @PostMapping("/musicas/{id}/curtir")
    public ResponseEntity<?> toggleLike(@PathVariable long id, @RequestHeader(value = "Authorization", required = false) String authorization) {
        if (!music.containsKey(id)) return ResponseEntity.notFound().build();
        User user = authenticatedUser(authorization);
        if (user == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("erro", "Faça login para curtir músicas."));
        Set<Long> userLikes = likesFor(user.email());
        boolean liked = userLikes.contains(id);
        if (liked) userLikes.remove(id); else userLikes.add(id);
        salvarDados();
        return ResponseEntity.ok(Map.of("curtida", !liked));
    }

    @GetMapping("/playlists")
    public Collection<Playlist> allPlaylists() {
        return playlists.values();
    }

    @PostMapping("/playlists")
    public ResponseEntity<?> createPlaylist(@RequestBody PlaylistRequest request,
                                            @RequestHeader(value = "Authorization", required = false) String authorization) {
        if (authenticatedUser(authorization) == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("erro", "Faça login para criar uma playlist."));
        if (request == null || blank(request.nome()) || request.nome().length() > 80) return ResponseEntity.badRequest().body(Map.of("erro", "Nome de playlist inválido."));
        Playlist playlist = new Playlist(playlistIds.getAndIncrement(), request.nome(), new ArrayList<>());
        playlists.put(playlist.id(), playlist);
        salvarDados();
        return ResponseEntity.ok(playlist);
    }

    @GetMapping("/playlists/{id}/musicas")
    public ResponseEntity<?> playlistMusic(@PathVariable long id) {
        Playlist playlist = playlists.get(id);
        if (playlist == null) return ResponseEntity.notFound().build();
        return ResponseEntity.ok(musicForIds(playlist.musicIds()));
    }

    private Map<String, String> session(User user) {
        return Map.of("token", jwtService.createToken(user.email()), "username", user.username(), "nome", user.name(), "email", user.email());
    }

    private Set<Long> likesFor(String token) {
        return likes.computeIfAbsent(token == null ? "anonymous" : token, ignored -> new HashSet<>());
    }

    private List<Music> musicForIds(Collection<Long> ids) {
        return ids.stream().map(music::get).filter(Objects::nonNull).toList();
    }

    private boolean blank(String value) { return value == null || value.isBlank(); }

    private User authenticatedUser(String authorization) {
        if (authorization == null || !authorization.startsWith("Bearer ")) return null;
        String email = jwtService.extractEmail(authorization.substring(7).trim());
        return email == null ? null : users.get(email.toLowerCase());
    }

    private boolean isOwner(Music item, String authorization) {
        User user = authenticatedUser(authorization);
        return user != null && user.username().equals(item.ownerUsername());
    }

    private boolean senhaValida(User user, String senha) {
        if (senha == null || user == null) return false;
        if (user.password().startsWith("$2a$") || user.password().startsWith("$2b$") || user.password().startsWith("$2y$")) {
            return passwordEncoder.matches(senha, user.password());
        }
        return user.password().equals(senha);
    }

    private boolean validarMusica(MusicRequest request) {
        return request != null && !blank(request.title()) && request.title().length() <= 160
            && !blank(request.artist()) && request.artist().length() <= 160
            && !blank(request.fileUrl()) && request.fileUrl().length() <= 15_000_000
            && (request.coverUrl() == null || request.coverUrl().length() <= 3_000_000)
            && (request.genre() == null || request.genre().length() <= 80)
            && (request.lyrics() == null || request.lyrics().length() <= 100_000);
    }

    private void carregarDados() {
        if (!Files.exists(dataFile)) return;
        try {
            State state = objectMapper.readValue(dataFile.toFile(), State.class);
            if (state.users() != null) state.users().forEach(user -> users.put(user.email(), user));
            if (state.music() != null) state.music().forEach(item -> music.put(item.id(), item));
            if (state.playlists() != null) state.playlists().forEach(item -> playlists.put(item.id(), item));
            if (state.likes() != null) likes.putAll(state.likes());
            musicIds.set(Math.max(1, music.keySet().stream().mapToLong(Long::longValue).max().orElse(0) + 1));
            playlistIds.set(Math.max(1, playlists.keySet().stream().mapToLong(Long::longValue).max().orElse(0) + 1));
        } catch (Exception ignored) {
            // Um arquivo inválido não impede o backend de iniciar com dados vazios.
        }
    }

    private void salvarDados() {
        try {
            objectMapper.writerWithDefaultPrettyPrinter().writeValue(dataFile.toFile(),
                new State(new ArrayList<>(users.values()), new ArrayList<>(music.values()), new ArrayList<>(playlists.values()), likes));
        } catch (Exception ignored) {
            // Falhas de disco não devem derrubar uma requisição já processada.
        }
    }

    public record Credentials(String username, String nome, String email, String senha) {}
    public record MusicRequest(String title, String artist, String coverUrl, String fileUrl, String genre, String lyrics) {}
    public record UserSummary(String username, String name) {}
    public record State(List<User> users, List<Music> music, List<Playlist> playlists, Map<String, Set<Long>> likes) {}
    public record PlaylistRequest(String nome) {}
    public record User(String username, String name, String email, String password) {}
    public record Music(Long id, String title, String artist, String coverUrl, String fileUrl, String genre, String lyrics, String ownerUsername) {}
    public record Playlist(Long id, String nome, List<Long> musicIds) {}
}
