package jp.kusakari.ec.common.web;

import jakarta.servlet.*;
import jakarta.servlet.http.*;
import java.io.IOException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
public class LocalApiFilter extends OncePerRequestFilter {

  private final String origin;
  private final String canvasOrigin;

  public LocalApiFilter(
    @Value("${kusakari.ec.web-origin}") String origin,
    @Value("${kusakari.ec.canvas-origin}") String canvasOrigin
  ) {
    this.origin = origin;
    this.canvasOrigin = canvasOrigin;
  }

  @Override
  protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
    throws ServletException, IOException {
    response.setHeader("X-Kusakari-EC-Backend", "spring-boot");
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    String host = request.getServerName();
    String requestOrigin = request.getHeader("Origin");
    if (
      (!"127.0.0.1".equals(host) && !"localhost".equals(host)) ||
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
        response.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
        response.setHeader("Access-Control-Allow-Headers", "Content-Type");
        response.setStatus(204);
        return;
      }
    }
    chain.doFilter(request, response);
  }
}
