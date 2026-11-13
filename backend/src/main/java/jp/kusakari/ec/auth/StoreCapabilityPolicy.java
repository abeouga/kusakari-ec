package jp.kusakari.ec.auth;

import java.util.EnumSet;
import java.util.Map;
import java.util.Set;
import jp.kusakari.ec.catalog.persistence.entity.StoreEntity;
import jp.kusakari.ec.store.persistence.entity.OrganizationMemberEntity;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/**
 * 店舗での立場と、できることの対応表（#130）。ロールを足すときは、{@link Position} と {@link #TABLE} を直すだけにする。
 *
 * <pre>
 * できること                         オーナー  ORG_ADMIN  MANAGER  STAFF  運営
 * VIEW_STORE_SALES（営業中・閉鎖中）   ○        ×          ○        ○      ○
 * VIEW_CLOSED_STORE_SALES（閉鎖済み）  ○        ○          ×        ×      ○
 * </pre>
 *
 * 閉鎖済み（closed_at あり）の店舗では、店長・スタッフは担当から外れる（#79）ので見られない。
 * ORG_ADMIN は、営業中の店舗では店舗のロールに従う（ロールのない店舗では人事の画面だけ。残りの決定 2-5）。
 * 運営が停止した営業中の店舗は、ほかの操作と同じく運営だけが見られる。閉鎖済みの店舗は、停止していても表のとおり。
 */
@Component
@RequiredArgsConstructor
public class StoreCapabilityPolicy {

  public enum Capability {
    VIEW_STORE_SALES,
    VIEW_CLOSED_STORE_SALES,
  }

  public enum Position {
    OWNER,
    ORG_ADMIN,
    MANAGER,
    STAFF,
    ADMIN,
  }

  static final Map<Capability, Set<Position>> TABLE = Map.of(
    Capability.VIEW_STORE_SALES,
    EnumSet.of(Position.OWNER, Position.MANAGER, Position.STAFF, Position.ADMIN),
    Capability.VIEW_CLOSED_STORE_SALES,
    EnumSet.of(Position.OWNER, Position.ORG_ADMIN, Position.ADMIN)
  );

  private final AuthService auth;

  /** その店舗の注文実績を見られるか。閉鎖済みかどうかで、使う「できること」が変わる。 */
  public boolean canViewSales(AuthMember member, StoreEntity store) {
    if (store.getClosedAt() != null) return can(member, store, Capability.VIEW_CLOSED_STORE_SALES);
    if (store.isSuspended() && !member.isAdmin()) return false;
    return can(member, store, Capability.VIEW_STORE_SALES);
  }

  public boolean can(AuthMember member, StoreEntity store, Capability capability) {
    Set<Position> allowed = TABLE.get(capability);
    return positionsAt(member, store).stream().anyMatch(allowed::contains);
  }

  /** その店舗での立場。ORG_ADMIN は、同じ組織の店舗なら店舗のロールと併せて持つ。 */
  Set<Position> positionsAt(AuthMember member, StoreEntity store) {
    Set<Position> positions = EnumSet.noneOf(Position.class);
    String role = auth.memberRoleAt(member, store);
    if (AuthMember.ADMIN.equals(role)) positions.add(Position.ADMIN);
    if ("OWNER".equals(role)) positions.add(Position.OWNER);
    if ("MANAGER".equals(role)) positions.add(Position.MANAGER);
    if ("STAFF".equals(role)) positions.add(Position.STAFF);
    if (
      OrganizationMemberEntity.ORG_ADMIN.equals(auth.organizationRoleOf(member)) &&
      store.getOrganizationId().equals(auth.organizationIdOf(member))
    ) positions.add(Position.ORG_ADMIN);
    return positions;
  }
}
