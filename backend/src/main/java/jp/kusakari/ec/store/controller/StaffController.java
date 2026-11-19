package jp.kusakari.ec.store.controller;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import java.util.List;
import java.util.Map;
import jp.kusakari.ec.store.service.MemberEventService;
import jp.kusakari.ec.store.service.OwnerSuccessionService;
import jp.kusakari.ec.store.service.StaffAccountService;
import jp.kusakari.ec.store.service.StoreInvitationService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

/** 出店者画面の人事：アカウント一覧とロール、店舗の招待キー（#111）、オーナーの譲渡の申し出（#203）。 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/seller")
public class StaffController {

  private static final String MEMBER_ID = "[0-9a-f-]{36}";

  private final StaffAccountService accounts;
  private final StoreInvitationService invitations;
  private final MemberEventService memberEvents;
  private final OwnerSuccessionService ownerSuccession;

  public record RoleRequest(@NotNull @Pattern(regexp = "MANAGER|STAFF|NONE") String role) {}

  public record OrganizationRoleRequest(boolean organizationAdmin) {}

  public record InvitationRequest(boolean singleUse) {}

  @GetMapping("/accounts")
  public StaffAccountService.AccountsView accounts() {
    return accounts.open();
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

  /** 組織から除名する（#175）。 */
  @PostMapping("/accounts/{memberId}/expulsion")
  public StaffAccountService.AccountsView expel(@PathVariable @Pattern(regexp = MEMBER_ID) String memberId) {
    return accounts.expel(memberId);
  }

  /** 除名した人を組織に復帰させる（#175）。 */
  @DeleteMapping("/accounts/{memberId}/expulsion")
  public StaffAccountService.AccountsView reinstate(@PathVariable @Pattern(regexp = MEMBER_ID) String memberId) {
    return accounts.reinstate(memberId);
  }

  /** オーナーの譲渡を申し出る（#203）。オーナーだけ。 */
  @PostMapping("/accounts/{memberId}/owner-succession")
  public StaffAccountService.AccountsView requestOwnerSuccession(
    @PathVariable @Pattern(regexp = MEMBER_ID) String memberId
  ) {
    return ownerSuccession.request(memberId);
  }

  /** 承認を待っている譲渡の申し出を取り消す（#203）。オーナーだけ。 */
  @DeleteMapping("/owner-succession")
  public StaffAccountService.AccountsView cancelOwnerSuccession() {
    return ownerSuccession.cancel();
  }

  /** 担当者の操作の履歴（#180）。除名・復帰は組織の全件、担当の出入りはこの店舗の分。 */
  @GetMapping("/stores/{storeId}/member-events")
  public List<MemberEventService.Event> memberEvents(@PathVariable long storeId) {
    return memberEvents.list(storeId);
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
