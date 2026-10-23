package jp.kusakari.ec.auth;

import jakarta.servlet.http.HttpServletRequest;

/** Keeps the Cognito refresh token in the server-side HTTP session only. */
final class CognitoRefreshSession {

  static final String ATTRIBUTE = "COGNITO_REFRESH_TOKEN";

  private CognitoRefreshSession() {}

  static void store(HttpServletRequest request, String refreshToken) {
    request.getSession().setAttribute(ATTRIBUTE, refreshToken);
  }

  static String find(HttpServletRequest request) {
    var session = request.getSession(false);
    if (session == null) return null;
    return session.getAttribute(ATTRIBUTE) instanceof String value ? value : null;
  }
}
