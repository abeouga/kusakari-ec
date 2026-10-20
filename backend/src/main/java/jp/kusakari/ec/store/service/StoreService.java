package jp.kusakari.ec.store.service;

import jakarta.validation.constraints.*;
import java.util.*;
import jp.kusakari.ec.auth.AuthService;
import jp.kusakari.ec.catalog.persistence.entity.StoreEntity;
import jp.kusakari.ec.catalog.persistence.repository.StoreRepository;
import jp.kusakari.ec.common.web.ApiException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional
public class StoreService {

  private final StoreRepository stores;
  private final AuthService auth;

  public record Profile(
    long id,
    long revision,
    String name,
    String company,
    String contact,
    String email,
    String address,
    String hours,
    String story,
    boolean enabled
  ) {}

  public record Input(
    long revision,
    @NotBlank @Size(max = 100) String name,
    @NotNull @Size(max = 100) String company,
    @NotNull @Size(max = 100) String contact,
    @NotNull @Email @Size(max = 200) String email,
    @NotBlank @Size(max = 200) String address,
    @NotBlank @Size(max = 80) String hours,
    @NotNull @Size(max = 1000) String story
  ) {}

  @Transactional(readOnly = true)
  public Profile get(long id) {
    return view(require(id));
  }

  @Transactional(readOnly = true)
  public List<Profile> list() {
    auth.requireAdmin();
    return stores.findAllByOrderByIdAsc().stream().map(this::view).toList();
  }

  public Profile save(long id, Input in) {
    auth.requireSeller(id);
    var s = require(id);
    if (s.getRevision() != in.revision()) throw new ApiException(409, "STORE_CHANGED", "店舗情報が更新されています。");
    s.updateProfile(in.name(), in.company(), in.contact(), in.email(), in.address(), in.hours(), in.story());
    stores.flush();
    return view(s);
  }

  public void enable(long id, boolean enabled) {
    auth.requireAdmin();
    require(id).changeEnabled(enabled);
  }

  private StoreEntity require(long id) {
    return stores.findById(id).orElseThrow(() -> new ApiException(404, "STORE_NOT_FOUND", "店舗が見つかりません。"));
  }

  private Profile view(StoreEntity s) {
    return new Profile(
      s.getId(),
      s.getRevision(),
      s.getName(),
      s.getCompany(),
      s.getContact(),
      s.getEmail(),
      s.getAddress(),
      s.getHours(),
      s.getStory(),
      s.isEnabled()
    );
  }
}
