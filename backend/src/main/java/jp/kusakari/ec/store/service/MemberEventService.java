package jp.kusakari.ec.store.service;

import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import jp.kusakari.ec.auth.AuthMember;
import jp.kusakari.ec.auth.AuthMemberRepository;
import jp.kusakari.ec.catalog.persistence.repository.StoreRepository;
import jp.kusakari.ec.common.web.ApiException;
import jp.kusakari.ec.store.persistence.entity.OrganizationMemberEventEntity;
import jp.kusakari.ec.store.persistence.repository.OrganizationMemberEventRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 担当者の操作の履歴（#170 の決めること5、#180）。見られるのはオーナーと ORG_ADMIN だけ。
 * 組織からの除名と復帰は組織の全件、店舗の担当にする・外すは選んでいる店舗の分だけを返す。
 * 操作された人が除名された後も記録は返す（#170 の決めること4）。
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class MemberEventService {

  private static final List<String> ORGANIZATION_EVENTS = List.of(
    OrganizationMemberEventEntity.EXPEL_FROM_ORGANIZATION,
    OrganizationMemberEventEntity.REINSTATE_TO_ORGANIZATION
  );

  private final StaffPolicy policy;
  private final OrganizationMemberEventRepository events;
  private final AuthMemberRepository members;
  private final StoreRepository stores;

  public record Person(String memberId, String name, String email) {}

  public record Event(long id, String eventType, Person actor, Person target, Long storeId, Instant createdAt) {}

  public List<Event> list(long storeId) {
    var viewer = policy.viewer();
    if (!viewer.personnel()) throw StaffPolicy.denied();
    stores
      .findById(storeId)
      .filter(store -> store.getOrganizationId().equals(viewer.organizationId()))
      .orElseThrow(() -> new ApiException(404, "STORE_NOT_FOUND", "店舗が見つかりません。"));
    List<OrganizationMemberEventEntity> rows = Stream.concat(
      events
        .findByOrganizationIdAndEventTypeInOrderByIdDesc(viewer.organizationId(), ORGANIZATION_EVENTS)
        .stream(),
      events.findByOrganizationIdAndStoreIdOrderByIdDesc(viewer.organizationId(), storeId).stream()
    )
      .sorted(Comparator.comparing(OrganizationMemberEventEntity::getId).reversed())
      .toList();
    Set<String> ids = rows
      .stream()
      .flatMap(row -> Stream.of(row.getActorMemberId(), row.getTargetMemberId()))
      .collect(Collectors.toSet());
    Map<String, AuthMember> people = members
      .findAllById(ids)
      .stream()
      .collect(Collectors.toMap(AuthMember::getId, Function.identity()));
    return rows
      .stream()
      .map(row ->
        new Event(
          row.getId(),
          row.getEventType(),
          person(people, row.getActorMemberId()),
          person(people, row.getTargetMemberId()),
          row.getStoreId(),
          row.getCreatedAt()
        )
      )
      .toList();
  }

  private static Person person(Map<String, AuthMember> people, String id) {
    var member = people.get(id);
    return member == null ? new Person(id, "", "") : new Person(id, member.getDisplayName(), member.getEmail());
  }
}
