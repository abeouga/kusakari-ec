package jp.kusakari.ec.auth;

import jakarta.persistence.LockModeType;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface AuthMemberRepository extends JpaRepository<AuthMember, String> {
  Optional<AuthMember> findByIssuerAndSubject(String issuer, String subject);

  @Lock(LockModeType.PESSIMISTIC_WRITE)
  @Query("select m from AuthMember m where m.id = :id")
  Optional<AuthMember> lockMember(@Param("id") String id);
}
