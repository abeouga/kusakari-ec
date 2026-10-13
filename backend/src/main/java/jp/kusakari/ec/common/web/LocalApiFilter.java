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

  public LocalApiFilter(@Value("${kusakari.ec.web-origin}") String origin) {
    this.origin = origin;
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
      (requestOrigin != null && !origin.equals(requestOrigin))
    ) {
      response.setStatus(403);
      response.setContentType("application/json;charset=UTF-8");
      response.getWriter().write("{\"code\":\"ORIGIN_REJECTED\",\"message\":\"許可されていない接続元です。\"}");
      return;
    }
    chain.doFilter(request, response);
  }
}
