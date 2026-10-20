package jp.kusakari.ec.member.controller;

import jakarta.validation.Valid;
import java.util.*;
import jp.kusakari.ec.member.service.MemberService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

@RestController
@RequiredArgsConstructor
public class MemberController {

  private final MemberService service;

  public record EnabledRequest(boolean enabled) {}

  @GetMapping("/api/account/address")
  public MemberService.Address address() {
    return service.address();
  }

  @PutMapping("/api/account/address")
  public MemberService.Address save(@Valid @RequestBody MemberService.Address input) {
    return service.save(input);
  }

  @DeleteMapping("/api/account/address")
  public Map<String, Boolean> delete() {
    service.deleteAddress();
    return Map.of("deleted", true);
  }

  @DeleteMapping("/api/account")
  public Map<String, Boolean> withdraw(jakarta.servlet.http.HttpServletRequest request) {
    service.withdraw();
    request.getSession().invalidate();
    org.springframework.security.core.context.SecurityContextHolder.clearContext();
    return Map.of("withdrawn", true);
  }

  @GetMapping("/api/operator/members")
  public List<MemberService.Member> list() {
    return service.list();
  }

  @PutMapping("/api/operator/members/{id}/enabled")
  public Map<String, Boolean> enabled(@PathVariable String id, @RequestBody EnabledRequest input) {
    service.enable(id, input.enabled());
    return Map.of("enabled", input.enabled());
  }
}
