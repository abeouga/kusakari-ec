package jp.kusakari.ec.moderation.service;

import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
import jp.kusakari.ec.auth.AuthMember;
import jp.kusakari.ec.auth.AuthMemberRepository;
import jp.kusakari.ec.common.web.ApiException;
import jp.kusakari.ec.moderation.dto.ModerationDtos.EventView;
import jp.kusakari.ec.moderation.dto.ModerationDtos.Warning;
import jp.kusakari.ec.moderation.persistence.entity.ModerationAction;
import jp.kusakari.ec.moderation.persistence.entity.ModerationEvent;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/**
 * 商品と店舗で共通の、履歴の読み方（#16）。
 * 「今、警告中か」は対象の列に持たず、警告と警告解除のうち最新の行が警告かどうかで求める。
 */
@Component
@RequiredArgsConstructor
public class ModerationHistory {

  /** 警告中かを求めるのに読む種別。 */
  public static final Set<ModerationAction> WARNING_TYPES = Set.of(ModerationAction.WARN, ModerationAction.CLEAR_WARNING);

  private final AuthMemberRepository members;

  /** 1つの対象の履歴（新しい順）から、今出ている警告を求める。 */
  public static Warning activeWarning(List<? extends ModerationEvent> newestFirst) {
    return newestFirst
      .stream()
      .filter(e -> WARNING_TYPES.contains(e.getEventType()))
      .findFirst()
      .filter(e -> e.getEventType() == ModerationAction.WARN)
      .map(e -> new Warning(e.getReason(), e.getCreatedAt()))
      .orElse(null);
  }

  /** 複数の対象の履歴（新しい順）から、警告中の対象とその警告を求める。 */
  public static <E extends ModerationEvent, K> Map<K, Warning> activeWarnings(List<E> newestFirst, Function<E, K> target) {
    Map<K, Warning> warnings = new HashMap<>();
    Set<K> decided = new HashSet<>();
    for (E event : newestFirst) {
      if (!WARNING_TYPES.contains(event.getEventType())) continue;
      K key = target.apply(event);
      if (!decided.add(key)) continue;
      if (event.getEventType() == ModerationAction.WARN) {
        warnings.put(key, new Warning(event.getReason(), event.getCreatedAt()));
      }
    }
    return warnings;
  }

  /** 履歴の表示。操作した運営者は表示名（なければメールアドレス）で出す。 */
  public List<EventView> views(List<? extends ModerationEvent> newestFirst) {
    Map<String, String> names = members
      .findAllById(newestFirst.stream().map(ModerationEvent::getActorMemberId).collect(Collectors.toSet()))
      .stream()
      .collect(Collectors.toMap(AuthMember::getId, ModerationHistory::nameOf));
    return newestFirst
      .stream()
      .map(e ->
        new EventView(e.getEventType().name(), e.getReason(), names.getOrDefault(e.getActorMemberId(), ""), e.getCreatedAt())
      )
      .toList();
  }

  /** 警告と停止は理由が必須。前後の空白を除いた理由を返す。 */
  public static String reasonFor(ModerationAction action, String reason) {
    String trimmed = reason == null ? "" : reason.trim();
    if (action.requiresReason() && trimmed.isEmpty()) throw new ApiException(
      400,
      "REASON_REQUIRED",
      "理由を入力してください。"
    );
    return trimmed;
  }

  /** 出店者への通知の本文：対象の名前と、あれば理由。 */
  public static String noticeBody(String targetName, String reason) {
    return reason.isEmpty() ? targetName : targetName + " / " + reason;
  }

  private static String nameOf(AuthMember member) {
    String name = member.getDisplayName();
    return name == null || name.isBlank() ? member.getEmail() : name;
  }
}
