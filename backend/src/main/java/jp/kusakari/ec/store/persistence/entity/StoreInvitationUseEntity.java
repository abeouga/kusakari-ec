package jp.kusakari.ec.store.persistence.entity;

import jakarta.persistence.Column;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/** 招待キーで登録した人。キーは新規登録のときだけ使えるので、1人1行まで。 */
@Entity
@Table(name = "store_invitation_uses")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class StoreInvitationUseEntity {

  @EmbeddedId
  private StoreInvitationUseId id;

  @Column(name = "used_at", nullable = false, insertable = false, updatable = false)
  private Instant usedAt;

  public StoreInvitationUseEntity(String invitationId, String memberId) {
    this.id = new StoreInvitationUseId(invitationId, memberId);
  }
}
