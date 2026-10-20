package jp.kusakari.ec.member.persistence.repository;

import java.util.*;
import jp.kusakari.ec.member.persistence.entity.AddressEntity;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AddressRepository extends JpaRepository<AddressEntity, String> {}
