package jp.kusakari.ec.store.persistence.repository;

import java.util.List;
import jp.kusakari.ec.store.persistence.entity.StoreMemberEntity;
import jp.kusakari.ec.store.persistence.entity.StoreMemberId;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface StoreMemberRepository extends JpaRepository<StoreMemberEntity, StoreMemberId> {
  @Query("select m from StoreMemberEntity m where m.id.memberId = :memberId order by m.id.storeId")
  List<StoreMemberEntity> findAllForMember(@Param("memberId") String memberId);

  @Query("select m from StoreMemberEntity m where m.id.storeId = :storeId and m.role is not null")
  List<StoreMemberEntity> findAssignedAtStore(@Param("storeId") long storeId);

  @Query("select m from StoreMemberEntity m where m.organizationId = :organizationId order by m.id.storeId")
  List<StoreMemberEntity> findAllInOrganization(@Param("organizationId") long organizationId);
}
