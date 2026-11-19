package jp.kusakari.ec.store.persistence.repository;

import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;
import jp.kusakari.ec.store.persistence.entity.OrganizationMemberEntity;
import jp.kusakari.ec.store.persistence.entity.OrganizationMemberId;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface OrganizationMemberRepository extends JpaRepository<OrganizationMemberEntity, OrganizationMemberId> {
  /** 担当者は1つの組織にだけ所属する（member_id の一意キー）。 */
  @Query("select m from OrganizationMemberEntity m where m.id.memberId = :memberId")
  Optional<OrganizationMemberEntity> findForMember(@Param("memberId") String memberId);

  @Query("select m from OrganizationMemberEntity m where m.id.organizationId = :organizationId")
  List<OrganizationMemberEntity> findAllInOrganization(@Param("organizationId") long organizationId);

  /** 所属を共有ロックで読む。除名の確定を待ってから、譲渡先にできるかを確かめる（#203）。 */
  @Lock(LockModeType.PESSIMISTIC_READ)
  @Query(
    "select m from OrganizationMemberEntity m where m.id.organizationId = :organizationId and m.id.memberId = :memberId"
  )
  Optional<OrganizationMemberEntity> lockShared(
    @Param("organizationId") long organizationId,
    @Param("memberId") String memberId
  );
}
