package jp.kusakari.ec.store.persistence.repository;

import java.util.Collection;
import java.util.List;
import jp.kusakari.ec.store.persistence.entity.StoreInvitationUseEntity;
import jp.kusakari.ec.store.persistence.entity.StoreInvitationUseId;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface StoreInvitationUseRepository extends JpaRepository<StoreInvitationUseEntity, StoreInvitationUseId> {
  @Query("select count(u) from StoreInvitationUseEntity u where u.id.invitationId = :invitationId")
  long countForInvitation(@Param("invitationId") String invitationId);

  @Query("select u from StoreInvitationUseEntity u where u.id.invitationId in :ids order by u.usedAt")
  List<StoreInvitationUseEntity> findForInvitations(@Param("ids") Collection<String> ids);
}
