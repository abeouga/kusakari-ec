package jp.kusakari.ec.store.service;

import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import jp.kusakari.ec.auth.AuthMember;
import jp.kusakari.ec.auth.AuthMemberRepository;
import jp.kusakari.ec.notification.persistence.entity.NotificationEntity;
import jp.kusakari.ec.notification.persistence.repository.NotificationRepository;
import jp.kusakari.ec.store.persistence.entity.OrganizationEntity;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/**
 * オーナーの譲渡の通知の宛て先と文面（店舗専用ページの本人あての通知だけで、メールは送らない。#194 の 2）。
 * 申し出は譲渡先に送り、譲渡の結果（交代・断り・取り消し・自動で無効）はオーナーと譲渡先の両方に送る（#194 の 9、#200 の決めること 1）。
 * NotificationService は、通知一覧の読み込みで {@link PendingOwnerSuccession} を使って期限切れを見つける。
 * 期限切れを無効にするときに送るこの部品から NotificationService を使うと依存が循環するので、NotificationRepository に直接保存する。
 * 呼ぶ側のトランザクションの中で保存するので、呼ぶ側が巻き戻せば通知も残らない。
 */
@Component
@RequiredArgsConstructor
public class OwnerSuccessionNotices {

  private static final DateTimeFormatter DEADLINE = DateTimeFormatter.ofPattern("uuuu/MM/dd HH:mm").withZone(
    ZoneId.of("Asia/Tokyo")
  );
  private static final String UNCHANGED = "オーナーは交代していません。";

  private final NotificationRepository notices;
  private final AuthMemberRepository members;

  /** 譲渡先に、申し出と承認の期限を知らせる。 */
  public void requested(OrganizationEntity organization, String successorId, Instant expiresAt) {
    send(
      successorId,
      NotificationEntity.OWNER_SUCCESSION_REQUEST,
      "オーナーの譲渡の申し出",
      "%sさんが、あなたに%sのオーナーを譲渡したいと申し出ています。承認すると、あなたが組織のオーナーになります。承認の期限は %s です。".formatted(
        nameOf(organization.getOwnerMemberId()),
        organization.getName(),
        DEADLINE.format(expiresAt)
      )
    );
  }

  /** 承認で交代したことを、新しいオーナーと元のオーナーに知らせる（#194 の 9）。 */
  public void approved(OrganizationEntity organization, AuthMember successor, AuthMember previousOwner) {
    String title = "オーナーが交代しました";
    send(
      successor.getId(),
      NotificationEntity.OWNER_SUCCESSION_RESULT,
      title,
      "オーナーの譲渡を承認し、あなたが%sのオーナーになりました。店舗の担当からは外れ、組織のすべての店舗を扱えます。%sさんは組織の ORG_ADMIN になりました。".formatted(
        organization.getName(),
        previousOwner.getDisplayName()
      )
    );
    send(
      previousOwner.getId(),
      NotificationEntity.OWNER_SUCCESSION_RESULT,
      title,
      "%sさんがオーナーの譲渡を承認し、%sのオーナーになりました。あなたは組織の ORG_ADMIN になり、オーナーの操作はできなくなりました。".formatted(
        successor.getDisplayName(),
        organization.getName()
      )
    );
  }

  /** オーナーが申し出を取り消したことを、オーナーと譲渡先に知らせる（#200 の決めること 1）。 */
  public void cancelled(OrganizationEntity organization, String successorId) {
    String title = "オーナーの譲渡の申し出が取り消されました";
    String ownerId = organization.getOwnerMemberId();
    String place = organization.getName();
    send(
      ownerId,
      NotificationEntity.OWNER_SUCCESSION_RESULT,
      title,
      "%sさんへの%sのオーナーの譲渡の申し出を取り消しました。%s".formatted(nameOf(successorId), place, UNCHANGED)
    );
    send(
      successorId,
      NotificationEntity.OWNER_SUCCESSION_RESULT,
      title,
      "%sさんが、あなたへの%sのオーナーの譲渡の申し出を取り消しました。%s".formatted(nameOf(ownerId), place, UNCHANGED)
    );
  }

  /** 譲渡先が申し出を断ったことを、オーナーと譲渡先に知らせる（#200 の決めること 1）。 */
  public void refused(OrganizationEntity organization, String successorId) {
    String title = "オーナーの譲渡の申し出が断られました";
    String ownerId = organization.getOwnerMemberId();
    String place = organization.getName();
    send(
      ownerId,
      NotificationEntity.OWNER_SUCCESSION_RESULT,
      title,
      "%sさんが、あなたからの%sのオーナーの譲渡の申し出を断りました。%s".formatted(
        nameOf(successorId),
        place,
        UNCHANGED
      )
    );
    send(
      successorId,
      NotificationEntity.OWNER_SUCCESSION_RESULT,
      title,
      "%sさんからの%sのオーナーの譲渡の申し出を断りました。%s".formatted(nameOf(ownerId), place, UNCHANGED)
    );
  }

  /**
   * 申し出が自動で無効になったことを、なぜ無効になったかと一緒に、オーナーと譲渡先に知らせる（#200 の決めること 1）。
   * expiresAt は、無効になった申し出の承認の期限。
   */
  public void invalidated(
    OrganizationEntity organization,
    String successorId,
    Instant expiresAt,
    PendingOwnerSuccession.Reason reason
  ) {
    String title = "オーナーの譲渡の申し出が無効になりました";
    String ownerId = organization.getOwnerMemberId();
    String place = organization.getName();
    send(
      ownerId,
      NotificationEntity.OWNER_SUCCESSION_RESULT,
      title,
      "%s、%sさんへの%sのオーナーの譲渡の申し出は無効になりました。%s".formatted(
        why(reason, "譲渡先", "あなた", expiresAt),
        nameOf(successorId),
        place,
        UNCHANGED
      )
    );
    send(
      successorId,
      NotificationEntity.OWNER_SUCCESSION_RESULT,
      title,
      "%s、%sさんからの%sのオーナーの譲渡の申し出は無効になりました。%s".formatted(
        why(reason, "あなた", "オーナー", expiresAt),
        nameOf(ownerId),
        place,
        UNCHANGED
      )
    );
  }

  /**
   * 無効になった理由の文。successor・owner は、受け取る人から見た譲渡先と申し出たオーナーの呼び方
   * （オーナーには「譲渡先」「あなた」、譲渡先には「あなた」「オーナー」）。
   */
  private static String why(PendingOwnerSuccession.Reason reason, String successor, String owner, Instant expiresAt) {
    return switch (reason) {
      case EXPIRED -> "承認の期限（%s）が過ぎたため".formatted(DEADLINE.format(expiresAt));
      case SUCCESSOR_EXPELLED -> successor + "が組織から除名されたため";
      case SUCCESSOR_DISABLED -> successor + "の利用が運営に停止されたため";
      case SUCCESSOR_WITHDRAWN -> successor + "が退会したため";
      case OWNER_DISABLED -> owner + "の利用が運営に停止されたため";
      case OWNER_WITHDRAWN -> owner + "が退会したため";
    };
  }

  /** オーナーと承認待ちの相手は members への外部キーを持ち、退会しても会員の行は残るので、必ず見つかる。 */
  private String nameOf(String memberId) {
    return members.findById(memberId).orElseThrow().getDisplayName();
  }

  private void send(String memberId, String category, String title, String body) {
    notices.save(new NotificationEntity(memberId, category, title, body));
  }
}
