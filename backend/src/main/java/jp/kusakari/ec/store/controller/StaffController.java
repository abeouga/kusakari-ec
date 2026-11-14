package jp.kusakari.ec.store.controller;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import java.util.List;
import java.util.Map;
import jp.kusakari.ec.store.service.StaffAccountService;
import jp.kusakari.ec.store.service.StoreInvitationService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

/** 出店者画面の人事：アカウント一覧とロール、店舗の招待キー（#111）。 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/seller")
public class StaffController {

  private static final String MEMBER_ID = "[0-9a-f-]{36}";

  private final StaffAccountService accounts;
  private final StoreInvitationService invitations;

  public record RoleRequest(@NotNull @Pattern(regexp = "MANAGER|STAFF|NONE") String role) {}

  public record OrganizationRoleRequest(boolean organizationAdmin) {}

  public record InvitationRequest(boolean singleUse) {}

  @GetMapping("/accounts")
  public StaffAccountService.AccountsView accounts() {
    return accounts.list();
  }

  @PutMapping("/accounts/{memberId}/stores/{storeId}")
  public StaffAccountService.AccountsView assign(
    @PathVariable @Pattern(regexp = MEMBER_ID) String memberId,
    @PathVariable long storeId,
    @Valid @RequestBody RoleRequest in
  ) {
    return accounts.assign(memberId, storeId, in.role());
  }

  @DeleteMapping("/accounts/{memberId}/stores/{storeId}")
  public StaffAccountService.AccountsView remove(
    @PathVariable @Pattern(regexp = MEMBER_ID) String memberId,
    @PathVariable long storeId
  ) {
    return accounts.removeAssignment(memberId, storeId);
  }

  @PutMapping("/accounts/{memberId}/organization-role")
  public StaffAccountService.AccountsView organizationRole(
    @PathVariable @Pattern(regexp = MEMBER_ID) String memberId,
    @RequestBody OrganizationRoleRequest in
  ) {
    return accounts.changeOrganizationRole(memberId, in.organizationAdmin());
  }

  @GetMapping("/stores/{storeId}/invitations")
  public List<StoreInvitationService.Invitation> invitations(@PathVariable long storeId) {
    return invitations.list(storeId);
  }

  @PostMapping("/stores/{storeId}/invitations")
  @ResponseStatus(HttpStatus.CREATED)
  public StoreInvitationService.Issued issue(@PathVariable long storeId, @RequestBody InvitationRequest in) {
    return invitations.issue(storeId, in.singleUse());
  }

  @PostMapping("/invitations/{id}/revoke")
  public Map<String, Boolean> revoke(@PathVariable @Pattern(regexp = MEMBER_ID) String id) {
    invitations.revoke(id);
    return Map.of("revoked", true);
  }
}
