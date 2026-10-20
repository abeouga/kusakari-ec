package jp.kusakari.ec.auth;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AuthMemberRepository extends JpaRepository<AuthMember, String> {
  java.util.List<AuthMember> findByStoreIdAndEnabledTrue(Long storeId);
  Optional<AuthMember> findByIssuerAndSubject(String issuer, String subject);

  @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
  @org.springframework.data.jpa.repository.Query("select m from AuthMember m where m.id = :id")
  Optional<AuthMember> lockMember(@org.springframework.data.repository.query.Param("id") String id);
}
