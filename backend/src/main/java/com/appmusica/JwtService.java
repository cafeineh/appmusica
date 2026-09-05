package com.appmusica;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SignatureAlgorithm;
import io.jsonwebtoken.security.Keys;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;

@Service
public class JwtService {
    private static final long TOKEN_DURATION_MS = 1000L * 60 * 60 * 24;
    private final SecretKey signingKey;

    public JwtService() {
        String configuredSecret = System.getenv("APP_JWT_SECRET");
        if (configuredSecret == null || configuredSecret.length() < 32) {
            throw new IllegalStateException("Defina APP_JWT_SECRET com pelo menos 32 caracteres antes de iniciar o backend.");
        }
        signingKey = Keys.hmacShaKeyFor(configuredSecret.getBytes(StandardCharsets.UTF_8));
    }

    public String createToken(String email) {
        Date issuedAt = new Date();
        return Jwts.builder()
            .setSubject(email)
            .setIssuedAt(issuedAt)
            .setExpiration(new Date(issuedAt.getTime() + TOKEN_DURATION_MS))
            .signWith(signingKey, SignatureAlgorithm.HS256)
            .compact();
    }

    public String extractEmail(String token) {
        try {
            Claims claims = Jwts.parserBuilder()
                .setSigningKey(signingKey)
                .build()
                .parseClaimsJws(token)
                .getBody();
            return claims.getSubject();
        } catch (RuntimeException exception) {
            return null;
        }
    }
}
