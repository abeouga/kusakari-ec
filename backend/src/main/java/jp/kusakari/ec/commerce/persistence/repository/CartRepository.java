package jp.kusakari.ec.commerce.persistence.repository;

import jakarta.persistence.LockModeType;
import java.util.Optional;
import jp.kusakari.ec.commerce.persistence.entity.CartEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface CartRepository extends JpaRepository<CartEntity, String> {
  Optional<CartEntity> findByMemberId(String memberId);
  @Lock(LockModeType.PESSIMISTIC_WRITE)
  @Query("select c from CartEntity c where c.id = :id")
  Optional<CartEntity> findLocked(@Param("id") String id);
}
