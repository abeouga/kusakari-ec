package jp.kusakari.ec.store.service;

import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import jp.kusakari.ec.auth.AuthMember;
import jp.kusakari.ec.auth.AuthMemberRepository;
import jp.kusakari.ec.common.web.ApiException;
import jp.kusakari.ec.notification.persistence.entity.NotificationEntity;
import jp.kusakari.ec.notification.service.NotificationService;
import jp.kusakari.ec.store.persistence.entity.OrganizationEntity;
import jp.kusakari.ec.store.persistence.entity.OrganizationMemberEventEntity;
import jp.kusakari.ec.store.persistence.repository.OrganizationMemberEventRepository;
import jp.kusakari.ec.store.persistence.repository.OrganizationMemberRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * オーナーによる譲渡の申し出と取り消し（#203。決定は #181・#194・#195・#196）。
 * 譲渡先は同じ組織の担当者のうち、除名中・停止中・退会済みでない人で、ロールの制限はない。
 * 同時に申し出られるのは 1 人だけで、期限は申し出た時刻＋30 分。期限が過ぎた申し出は残っていないものとして扱う。
 * 知らせるのは店舗専用ページの通知だけで、メールは送らない。承認・断り（#204）はここに入れない。
 */
@Service
@RequiredArgsConstructor
@Transactional
public class OwnerSuccessionService {

  private static final Duration APPROVAL_PERIOD = Duration.ofMinutes(30);
  private static final DateTimeFormatter DEADLINE = DateTimeFormatter.ofPattern("uuuu/MM/dd HH:mm").withZone(
    ZoneId.of("Asia/Tokyo")
  );

  private final StaffPolicy policy;
  private final PendingOwnerSuccession pending;
  private final OrganizationMemberRepository organizationMembers;
  private final AuthMemberRepository members;
  private final OrganizationMemberEventRepository events;
  private final NotificationService notices;
  private final StaffAccountService accounts;

  /**
   * 譲渡を申し出る。組織の行をロックしてから、期限が過ぎた申し出を先に無効として記録し（#194 の 16）、
   * 承認待ちが残っていなければ受け付けて、譲渡先に「譲渡の申し出」の通知を送る。
   */
  public StaffAccountService.AccountsView request(String memberId) {
    var viewer = ownerOnly();
    OrganizationEntity organization = pending.lock(viewer.organizationId());
    pending.expireIfDue(organization);
    // 期限切れはここまでに空に戻っているので、残っているのは期限内の申し出だけ（時刻を取り直して判定を食い違わせない）。
    if (organization.getPendingOwnerMemberId() != null) {
      throw new ApiException(
        409,
        "OWNER_SUCCESSION_PENDING",
        "承認を待っている譲渡の申し出があります。取り消すか、期限が過ぎてから申し出てください。"
      );
    }
    AuthMember successor = successorOf(organization, memberId);
    Instant expiresAt = Instant.now().plus(APPROVAL_PERIOD);
    organization.requestOwnerSuccession(successor.getId(), expiresAt);
    record(organization, OrganizationMemberEventEntity.OWNER_SUCCESSION_REQUEST, viewer.memberId(), successor.getId());
    String owner = members.findById(viewer.memberId()).map(AuthMember::getDisplayName).orElse("オーナー");
    notices.send(
      successor.getId(),
      NotificationEntity.OWNER_SUCCESSION_REQUEST,
      "オーナーの譲渡の申し出",
      "%sさんが、あなたに%sのオーナーを譲渡したいと申し出ています。承認すると、あなたが組織のオーナーになります。承認の期限は %s です。".formatted(
        owner,
        organization.getName(),
        DEADLINE.format(expiresAt)
      )
    );
    events.flush();
    return accounts.list();
  }

  /** 承認される前の申し出を取り消す（#194 の 5）。期限が過ぎた申し出は、取り消せるものとして扱わない。 */
  public StaffAccountService.AccountsView cancel() {
    var viewer = ownerOnly();
    OrganizationEntity organization = pending.lock(viewer.organizationId());
    if (!organization.hasPendingOwnerSuccession(Instant.now())) {
      throw new ApiException(409, "OWNER_SUCCESSION_NOT_PENDING", "承認を待っている譲渡の申し出はありません。");
    }
    String successor = organization.getPendingOwnerMemberId();
    organization.clearOwnerSuccession();
    record(organization, OrganizationMemberEventEntity.OWNER_SUCCESSION_CANCELLATION, viewer.memberId(), successor);
    events.flush();
    return accounts.list();
  }

  private StaffPolicy.Viewer ownerOnly() {
    var viewer = policy.viewer();
    if (!viewer.canHandOverOwnership()) throw StaffPolicy.denied();
    return viewer;
  }

  /**
   * 譲渡先にできる人（#181 の 2）。所属と会員の行をロックして読み、同時に進む除名・停止・退会の確定を待ってから確かめる。
   * オーナー本人と別の組織の会員は、organization_members に行がないので見つからない。
   */
  private AuthMember successorOf(OrganizationEntity organization, String memberId) {
    var membership = organizationMembers
      .lockShared(organization.getId(), memberId)
      .orElseThrow(() -> new ApiException(404, "ACCOUNT_NOT_FOUND", "アカウントが見つかりません。"));
    var member = members
      .lockMember(memberId)
      .orElseThrow(() -> new ApiException(404, "ACCOUNT_NOT_FOUND", "アカウントが見つかりません。"));
    if (membership.isExpelled() || !member.isEnabled() || member.getWithdrawnAt() != null) {
      throw new ApiException(
        409,
        "OWNER_SUCCESSION_TARGET_UNAVAILABLE",
        "除名中・停止中・退会済みのアカウントは、譲渡先にできません。"
      );
    }
    return member;
  }

  private void record(OrganizationEntity organization, String eventType, String actorId, String targetId) {
    events.save(OrganizationMemberEventEntity.ofOwnerSuccession(organization.getId(), eventType, actorId, targetId));
  }
}
