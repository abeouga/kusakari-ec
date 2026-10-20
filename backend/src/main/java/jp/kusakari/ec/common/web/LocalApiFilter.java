package jp.kusakari.ec.common.web;

import jakarta.servlet.*;
import jakarta.servlet.http.*;
import java.io.IOException;
import java.net.URI;
import java.util.Set;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
public class LocalApiFilter extends OncePerRequestFilter {

  private final String origin;
  private final String canvasOrigin;
  private final Set<String> hosts;
  private final boolean container;

  public LocalApiFilter(
    @Value("${kusakari.ec.web-origin}") String origin,
    @Value("${kusakari.ec.canvas-origin}") String canvasOrigin,
    @Value("${kusakari.ec.container:false}") boolean container,
    @Value("${KUSAKARI_PRIVATE_PREVIEW:false}") boolean privatePreview
  ) {
    this.origin = origin;
    this.canvasOrigin = canvasOrigin;
    this.container = container;
    if (container && !privatePreview) throw new IllegalArgumentException("Container mode requires a private access boundary and KUSAKARI_PRIVATE_PREVIEW=true.");
    var publicUri = URI.create(origin);
    if (container && (publicUri.getHost() == null || publicUri.getRawUserInfo() != null ||
        !(publicUri.getScheme().equals("https") || publicUri.getScheme().equals("http")) ||
        publicUri.getRawQuery() != null || publicUri.getRawFragment() != null || !publicUri.getRawPath().isEmpty())) {
      throw new IllegalArgumentException("KUSAKARI_PUBLIC_ORIGIN must be an HTTP(S) origin without path or credentials.");
    }
    this.hosts = container ? new java.util.HashSet<>(java.util.List.of("127.0.0.1", "localhost", publicUri.getHost())) : Set.of("127.0.0.1", "localhost");
  }

  @Override
  protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
    throws ServletException, IOException {
    response.setHeader("X-Kusakari-EC-Backend", "spring-boot");
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    String host = request.getServerName();
    String requestOrigin = request.getHeader("Origin");
    boolean health = container && "GET".equals(request.getMethod()) &&
      Set.of("/api/health", "/api/health/ready").contains(request.getRequestURI());
    if (
      (!health && !hosts.contains(host)) ||
      (requestOrigin != null && !origin.equals(requestOrigin) && !canvasOrigin.equals(requestOrigin))
    ) {
      response.setStatus(403);
      response.setContentType("application/json;charset=UTF-8");
      response.getWriter().write("{\"code\":\"ORIGIN_REJECTED\",\"message\":\"許可されていない接続元です。\"}");
      return;
    }
    if (requestOrigin != null) {
      response.setHeader("Vary", "Origin");
      response.setHeader("Access-Control-Allow-Origin", requestOrigin);
      response.setHeader("Access-Control-Allow-Credentials", "true");
      if ("OPTIONS".equals(request.getMethod())) {
        response.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
        response.setHeader("Access-Control-Allow-Headers", "Content-Type, X-CSRF-TOKEN");
        response.setStatus(204);
        return;
      }
    }
    chain.doFilter(request, response);
  }
}
